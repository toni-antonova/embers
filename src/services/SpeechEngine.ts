/**
 * SpeechEngine — Hybrid real-time speech-to-text with automatic fallback.
 *
 * ARCHITECTURE:
 * ─────────────
 * Two-tier speech recognition with lazy detection:
 *
 *   1. PRIMARY: Web Speech API (Chrome, Safari, Edge) — free, zero setup
 *   2. FALLBACK: WebSocket to Deepgram Nova-2 — works everywhere, ~$0.0077/min
 *
 * Detection happens lazily on first mic tap, not on page load (avoids premature
 * mic permission prompts). The result is cached so subsequent start() calls
 * don't re-probe.
 *
 * SAFARI WORKAROUNDS:
 * ───────────────────
 * iOS Safari's Web Speech API has several confirmed bugs (iOS 15–18):
 *   - isFinal is sometimes never set to true → timeout-based finalization
 *   - Transcript repetition after speech ends → deduplication filter
 *   - Continuous mode produces one growing string → handled by re-creation
 *   - PWA/homescreen mode silently fails → detected and falls to WebSocket
 *   - 2–3 second warm-up delay → accepted, no workaround needed
 *
 * INDUSTRY CONTEXT:
 * ─────────────────
 * The Web Speech API routes audio to Google's (Chrome) or Apple's (Safari)
 * cloud servers. Internet + HTTPS are required. The WebSocket fallback uses
 * Deepgram's Nova-2 model with explicit linear16 PCM encoding.
 */

import { WebSocketSTTClient } from '../audio/WebSocketSTTClient';
import type { TranscriptEvent } from '../audio/types';

// Re-export so existing consumers (Canvas, AnalysisPanel, GhostTranscript, etc.)
// can keep importing from this module without changing their import paths.
export type { TranscriptEvent };

// ── STT STATUS ───────────────────────────────────────────────────────
// Observable status so the UI can show speech recognition state.
export type STTStatus = 'off' | 'listening' | 'restarting' | 'error' | 'unsupported' | 'connecting-ws';

// ── CALLBACK TYPES ───────────────────────────────────────────────────
type TranscriptCallback = (event: TranscriptEvent) => void;
type StatusCallback = (status: STTStatus, errorDetail?: string) => void;

// ── SPEECH RECOGNITION TYPE SHIM ─────────────────────────────────────
interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionResultList {
    length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
    isFinal: boolean;
    length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
}

interface SpeechRecognitionInstance extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onend: (() => void) | null;
    onerror: ((event: Event & { error: string }) => void) | null;
    onstart: (() => void) | null;
}

// ── FATAL ERRORS ─────────────────────────────────────────────────────
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported']);

// Max retries for recoverable errors before giving up
const MAX_RETRIES = 5;

// Safari workaround: if no isFinal=true within this timeout after the
// last interim result, force-finalize the transcript.
const SAFARI_FINAL_TIMEOUT_MS = 750;

// ── DETECTION CACHE ──────────────────────────────────────────────────
// Once we've probed whether Web Speech API actually works, cache the result.
// 'untested' = haven't tried yet, 'works' = start() succeeded, 'broken' = failed
type WebSpeechProbeResult = 'untested' | 'works' | 'broken';

// ── SPEECH ENGINE CLASS ──────────────────────────────────────────────
export class SpeechEngine {
    // ── PUBLIC STATE ─────────────────────────────────────────────────
    isSupported: boolean;

    private _isRunning = false;

    // ── STATUS ───────────────────────────────────────────────────────
    private _status: STTStatus = 'off';
    private _lastError: string = '';
    private statusListeners: Set<StatusCallback> = new Set();

    // ── WEB SPEECH API STATE ─────────────────────────────────────────
    private recognition: SpeechRecognitionInstance | null = null;
    private listeners: Set<TranscriptCallback> = new Set();
    private restartTimer: ReturnType<typeof setTimeout> | null = null;
    private restartDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private intentionallyStopped = false;
    private retryCount = 0;
    private dryRestartCount = 0;

    // ── SAFARI WORKAROUNDS ───────────────────────────────────────────
    /** Timer for force-finalizing transcripts on Safari (broken isFinal). */
    private safariFinalTimer: ReturnType<typeof setTimeout> | null = null;
    /** Last interim transcript text — used for deduplication. */
    private lastInterimText = '';
    /** Previous final transcript — detects Safari's repetition bug. */
    private lastFinalText = '';
    /** Is the current browser Safari? */
    private readonly isSafari: boolean;

    // ── WEBSOCKET FALLBACK ───────────────────────────────────────────
    /** The WebSocket STT client (Deepgram). Lazy-initialized on first need. */
    private wsClient: WebSocketSTTClient | null = null;
    /** Cleanup handle for WebSocket transcript subscription (retained for future dispose). */
    private _wsTranscriptUnsub: (() => void) | null = null;
    /** Cleanup handle for WebSocket status subscription (retained for future dispose). */
    private _wsStatusUnsub: (() => void) | null = null;
    /** Whether we're currently using the WebSocket path. */
    private usingWebSocket = false;

    // ── DETECTION CACHE ──────────────────────────────────────────────
    /** Cached result of probing whether Web Speech API actually works. */
    private webSpeechProbe: WebSpeechProbeResult = 'untested';

    /** Deepgram API key from env. */
    private readonly deepgramApiKey: string;

    constructor() {
        // ── DETECT WEB SPEECH API SUPPORT ────────────────────────────
        this.isSupported =
            'SpeechRecognition' in window ||
            'webkitSpeechRecognition' in window;

        // ── DETECT SAFARI ────────────────────────────────────────────
        const ua = navigator.userAgent;
        this.isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);

        // Read Deepgram API key from env (Vite injects VITE_ prefixed vars)
        this.deepgramApiKey = (typeof import.meta !== 'undefined' &&
            import.meta.env?.VITE_DEEPGRAM_API_KEY) || '';

        if (!this.isSupported) {
            this._status = 'unsupported';
        }

        console.log(
            `[SpeechEngine] Web Speech API ${this.isSupported ? '✅ supported' : '❌ not supported'}` +
            (this.isSafari ? ' (Safari detected — workarounds active)' : '') +
            (this.deepgramApiKey ? ' | Deepgram fallback available' : ' | ⚠️ No VITE_DEEPGRAM_API_KEY — WebSocket fallback disabled')
        );
    }

    // ── PUBLIC API ───────────────────────────────────────────────────

    get isRunning(): boolean {
        return this._isRunning;
    }

    /**
     * Start speech recognition.
     *
     * LAZY DETECTION STRATEGY:
     * If Web Speech API is available but untested, try it. If it fails
     * (e.g. service-not-allowed on iOS PWA), automatically fall through
     * to the WebSocket path. The probe result is cached.
     */
    start(): void {
        // ── Already running ──────────────────────────────────────────
        if (this._isRunning) {
            console.log('[SpeechEngine] Already running, skipping start()');
            return;
        }

        // ── No Web Speech + No Deepgram key → text-only ─────────────
        if (!this.isSupported && !this.deepgramApiKey) {
            this._isRunning = true;
            this.setStatus('unsupported');
            console.log('[SpeechEngine] Started in text-input fallback mode');
            return;
        }

        // ── Web Speech known to work → use it ────────────────────────
        if (this.isSupported && this.webSpeechProbe === 'works') {
            this.intentionallyStopped = false;
            this.createRecognition();
            return;
        }

        // ── Web Speech known broken → use WebSocket ──────────────────
        if (this.webSpeechProbe === 'broken') {
            this.startWebSocketFallback();
            return;
        }

        // ── Web Speech available but untested → try it ───────────────
        if (this.isSupported && this.webSpeechProbe === 'untested') {
            this.intentionallyStopped = false;
            this.createRecognition();
            return;
        }

        // ── No Web Speech, but have Deepgram key → WebSocket ─────────
        if (!this.isSupported && this.deepgramApiKey) {
            this.startWebSocketFallback();
            return;
        }
    }

    /**
     * Stop speech recognition.
     */
    stop(): void {
        this.intentionallyStopped = true;
        this._isRunning = false;

        // Cancel pending timers
        if (this.restartTimer !== null) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }
        if (this.restartDebounceTimer !== null) {
            clearTimeout(this.restartDebounceTimer);
            this.restartDebounceTimer = null;
        }
        if (this.safariFinalTimer !== null) {
            clearTimeout(this.safariFinalTimer);
            this.safariFinalTimer = null;
        }

        // Stop Web Speech recognition
        if (this.recognition) {
            try {
                this.recognition.abort();
            } catch {
                // Some browsers throw if recognition isn't active
            }
            this.recognition = null;
        }

        // Stop WebSocket client and clean up subscriptions.
        // Destroy the client so a fresh one is created on next start().
        if (this.wsClient) {
            this.wsClient.destroy();
            this.wsClient = null;
        }
        if (this._wsTranscriptUnsub) {
            this._wsTranscriptUnsub();
            this._wsTranscriptUnsub = null;
        }
        if (this._wsStatusUnsub) {
            this._wsStatusUnsub();
            this._wsStatusUnsub = null;
        }

        this.usingWebSocket = false;
        this.setStatus('off');
        console.log('[SpeechEngine] Stopped');
    }

    /**
     * Register a callback to receive transcript events.
     */
    onTranscript(callback: TranscriptCallback): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Subscribe to status changes.
     */
    onStatusChange(callback: StatusCallback): () => void {
        this.statusListeners.add(callback);
        callback(this._status, this._lastError);
        return () => this.statusListeners.delete(callback);
    }

    get status(): STTStatus {
        return this._status;
    }

    get lastError(): string {
        return this._lastError;
    }

    /**
     * Submit text manually (text-input fallback).
     */
    submitText(text: string): void {
        if (!text.trim()) return;
        this.emit({
            text: text.trim(),
            isFinal: true,
            timestamp: Date.now(),
        });
    }

    // ── WEB SPEECH API METHODS ──────────────────────────────────────

    /**
     * Create and configure a new SpeechRecognition instance.
     */
    private createRecognition(): void {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognitionCtor) return;

        const recognition: SpeechRecognitionInstance = new SpeechRecognitionCtor();

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        // ── EVENT HANDLERS ───────────────────────────────────────────

        recognition.onstart = () => {
            this._isRunning = true;
            this.retryCount = 0;

            // Probe succeeded — cache it
            if (this.webSpeechProbe === 'untested') {
                this.webSpeechProbe = 'works';
                console.log('[SpeechEngine] ✅ Web Speech API probe: works');
            }

            // Cancel debounced 'restarting' flash
            if (this.restartDebounceTimer !== null) {
                clearTimeout(this.restartDebounceTimer);
                this.restartDebounceTimer = null;
            }
            this.setStatus('listening');
            console.log('[SpeechEngine] 🎤 Recognition started');
        };

        let sessionHadResults = false;

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            sessionHadResults = true;

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const transcript = result[0].transcript;
                const isFinal = result.isFinal;

                // ── SAFARI WORKAROUND: Deduplication ─────────────────
                // Safari sometimes repeats the entire transcript after speech ends.
                if (this.isSafari && isFinal && transcript === this.lastFinalText) {
                    console.log('[SpeechEngine] Safari dedup: skipping repeated final transcript');
                    continue;
                }

                // ── SAFARI WORKAROUND: isFinal timeout ───────────────
                // Safari sometimes never sets isFinal=true. We track the
                // last interim result and force-finalize after 750ms of silence.
                if (this.isSafari && !isFinal) {
                    this.lastInterimText = transcript;

                    // Reset the finalization timer
                    if (this.safariFinalTimer) clearTimeout(this.safariFinalTimer);
                    this.safariFinalTimer = setTimeout(() => {
                        this.safariFinalTimer = null;
                        if (this.lastInterimText) {
                            console.log('[SpeechEngine] Safari workaround: force-finalizing after timeout');
                            const forcedEvent: TranscriptEvent = {
                                text: this.lastInterimText,
                                isFinal: true,
                                timestamp: Date.now(),
                            };
                            this.lastFinalText = this.lastInterimText;
                            this.lastInterimText = '';
                            this.emit(forcedEvent);
                        }
                    }, SAFARI_FINAL_TIMEOUT_MS);
                }

                if (isFinal) {
                    this.lastFinalText = transcript;
                    this.lastInterimText = '';
                    // Cancel Safari timer — real final arrived
                    if (this.safariFinalTimer) {
                        clearTimeout(this.safariFinalTimer);
                        this.safariFinalTimer = null;
                    }
                }

                const transcriptEvent: TranscriptEvent = {
                    text: transcript,
                    isFinal,
                    timestamp: Date.now(),
                };

                this.emit(transcriptEvent);
            }
        };

        recognition.onend = () => {
            if (!this.intentionallyStopped) {
                if (sessionHadResults) {
                    this.dryRestartCount = 0;
                } else {
                    this.dryRestartCount++;
                }

                const baseDelay = 300;
                const restartDelay = Math.min(
                    baseDelay * Math.pow(2, this.dryRestartCount),
                    10000,
                );

                if (this.dryRestartCount > 3) {
                    console.warn(
                        `[SpeechEngine] ${this.dryRestartCount} dry restarts in a row — ` +
                        `backing off to ${restartDelay}ms. Speech service may be unavailable.`
                    );
                } else {
                    console.log('[SpeechEngine] Recognition ended — auto-restarting...');
                }

                this.restartDebounceTimer = setTimeout(() => {
                    this.restartDebounceTimer = null;
                    if (!this.intentionallyStopped) {
                        this.setStatus('restarting');
                    }
                }, 800);

                this.restartTimer = setTimeout(() => {
                    this.restartTimer = null;
                    if (!this.intentionallyStopped) {
                        this.createRecognition();
                    }
                }, restartDelay);
            } else {
                this._isRunning = false;
                if (this._status !== 'unsupported') {
                    this.setStatus('off');
                }
                console.log('[SpeechEngine] Recognition ended (intentional stop)');
            }
        };

        recognition.onerror = (event: Event & { error: string }) => {
            const errorType = event.error;

            if (errorType === 'aborted') return;

            if (errorType === 'no-speech') {
                console.log('[SpeechEngine] No speech detected — will auto-restart');
                return;
            }

            // ── FATAL ERRORS → try WebSocket fallback ────────────────
            if (FATAL_ERRORS.has(errorType)) {
                this._lastError = errorType;

                // Cache probe result
                if (this.webSpeechProbe === 'untested') {
                    this.webSpeechProbe = 'broken';
                    console.log(`[SpeechEngine] Web Speech API probe: broken (${errorType})`);
                }

                // Try WebSocket fallback before giving up
                if (this.deepgramApiKey) {
                    console.log(`[SpeechEngine] ⚠️ Web Speech fatal error "${errorType}" — switching to WebSocket fallback`);
                    this.intentionallyStopped = true; // prevent onend from restarting
                    this.recognition = null;
                    this.startWebSocketFallback();
                    return;
                }

                // No fallback available — text input mode
                this.isSupported = false;
                this.setStatus('unsupported', errorType);
                this.intentionallyStopped = true;
                this._isRunning = true;
                console.warn(`[SpeechEngine] ⛔ Fatal error: "${errorType}" — text-input fallback`);
                return;
            }

            // ── RECOVERABLE ERRORS ───────────────────────────────────
            this._lastError = errorType;
            this.setStatus('error', errorType);
            console.warn(`[SpeechEngine] ⚠️ Error: "${errorType}" (retry ${this.retryCount + 1}/${MAX_RETRIES})`);

            if (!this.intentionallyStopped && this.retryCount < MAX_RETRIES) {
                const delay = Math.min(1000 * Math.pow(2, this.retryCount), 16000);
                this.retryCount++;
                this.restartTimer = setTimeout(() => {
                    this.restartTimer = null;
                    if (!this.intentionallyStopped) {
                        console.log(`[SpeechEngine] Retrying after error (attempt ${this.retryCount}/${MAX_RETRIES})...`);
                        this.createRecognition();
                    }
                }, delay);
            } else if (this.retryCount >= MAX_RETRIES) {
                // Max retries on Web Speech — try WebSocket as last resort
                if (this.deepgramApiKey && !this.usingWebSocket) {
                    console.log('[SpeechEngine] Max Web Speech retries — switching to WebSocket');
                    this.startWebSocketFallback();
                } else {
                    console.warn(`[SpeechEngine] ⛔ Max retries (${MAX_RETRIES}) reached — giving up`);
                    this._isRunning = false;
                }
            }
        };

        // ── START ────────────────────────────────────────────────────
        this.recognition = recognition;

        try {
            recognition.start();
        } catch (e) {
            console.error('[SpeechEngine] Failed to start recognition:', e);

            // If first-time probe fails with an exception, try WebSocket
            if (this.webSpeechProbe === 'untested') {
                this.webSpeechProbe = 'broken';
                if (this.deepgramApiKey) {
                    console.log('[SpeechEngine] Web Speech start() threw — trying WebSocket fallback');
                    this.startWebSocketFallback();
                    return;
                }
            }

            this._isRunning = false;
        }
    }

    // ── WEBSOCKET FALLBACK ──────────────────────────────────────────

    /**
     * Start the WebSocket STT fallback (Deepgram). Called when Web Speech
     * API is unavailable, broken, or has exhausted retries.
     */
    private startWebSocketFallback(): void {
        if (this.usingWebSocket) return;
        if (!this.deepgramApiKey) {
            console.warn('[SpeechEngine] No Deepgram API key — cannot start WebSocket fallback');
            this.setStatus('unsupported', 'no-api-key');
            this._isRunning = true;
            this.isSupported = false;
            return;
        }

        this.usingWebSocket = true;
        this.setStatus('connecting-ws');
        console.log('[SpeechEngine] 🔌 Starting WebSocket STT fallback (Deepgram)');

        // Create WebSocket client if not already created
        if (!this.wsClient) {
            this.wsClient = new WebSocketSTTClient(this.deepgramApiKey);

            // Wire up transcript events → our listeners
            this._wsTranscriptUnsub = this.wsClient.onTranscript((event) => {
                this.emit(event);
            });

            // Wire up status changes
            this._wsStatusUnsub = this.wsClient.onStatusChange((wsStatus) => {
                switch (wsStatus) {
                    case 'connecting':
                    case 'reconnecting':
                        this.setStatus('connecting-ws');
                        break;
                    case 'listening':
                        this.setStatus('listening');
                        break;
                    case 'error':
                        this.setStatus('error', 'websocket');
                        break;
                    case 'closed':
                        if (this._isRunning) {
                            this.setStatus('error', 'ws-closed');
                        }
                        break;
                }
            });
        }

        // Start mic capture + WebSocket connection
        this.wsClient.start().catch((err) => {
            console.error('[SpeechEngine] WebSocket fallback failed to start:', err);
            this.usingWebSocket = false;
            // Final fallback: text input
            this.isSupported = false;
            this.setStatus('unsupported', 'ws-failed');
            this._isRunning = true;
        });

        this._isRunning = true;
    }

    // ── INTERNAL ────────────────────────────────────────────────────

    /**
     * Emit a TranscriptEvent to all registered listeners.
     */
    private emit(event: TranscriptEvent): void {
        const prefix = event.isFinal ? '✅ FINAL' : '💬 interim';
        console.log(`[SpeechEngine] ${prefix}: "${event.text}"`);

        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (e) {
                console.error('[SpeechEngine] Listener error:', e);
            }
        }
    }

    /**
     * Update the STT status and notify all status listeners.
     */
    private setStatus(status: STTStatus, errorDetail?: string): void {
        this._status = status;
        if (errorDetail) {
            this._lastError = errorDetail;
        }
        for (const listener of this.statusListeners) {
            try {
                listener(status, errorDetail);
            } catch (e) {
                console.error('[SpeechEngine] Status listener error:', e);
            }
        }
    }
}
