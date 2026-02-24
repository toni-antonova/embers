/**
 * SpeechEngine — Real-time speech-to-text using the Web Speech API.
 *
 * WHY THIS SERVICE?
 * ─────────────────
 * The particle system already reacts to HOW speech sounds (volume, pitch,
 * rhythm) via AudioEngine + Meyda. But to map visuals to WHAT is being
 * said — semantic meaning — we need actual text transcription.
 *
 * The Web Speech API (specifically SpeechRecognition) provides free,
 * browser-native speech-to-text with no API keys or server costs.
 * It's supported in Chrome, Edge, and Safari (via webkit prefix).
 * For browsers without support (Firefox), we fall back to a text input.
 *
 * ARCHITECTURE:
 * ─────────────
 * - SpeechEngine follows the same start()/stop()/callback pattern as AudioEngine
 * - Subscribers register via onTranscript(callback) and receive TranscriptEvents
 * - The recognition is configured for continuous, real-time transcription
 * - Auto-restart on `end` event keeps it always listening
 * - Error recovery with a 1-second retry delay prevents crash loops
 *
 * INDUSTRY CONTEXT:
 * ─────────────────
 * The Web Speech API uses the same underlying engine as Google Assistant
 * (in Chrome) or Siri (in Safari). While it doesn't match dedicated
 * services like Whisper or Deepgram in accuracy, it's zero-latency
 * (no network round-trip), free, and requires no API keys — perfect
 * for a real-time creative coding project.
 */

// ── STT STATUS ───────────────────────────────────────────────────────
// Observable status so the UI can show whether the Web Speech API is
// actively listening, recovering from an error, or has failed.
export type STTStatus = 'off' | 'listening' | 'restarting' | 'error' | 'unsupported';

// ── TRANSCRIPT EVENT ─────────────────────────────────────────────────
// This is the standard event shape emitted for every recognized chunk
// of speech. Both the Web Speech API path and the text-input fallback
// produce events in this exact format, so downstream consumers don't
// need to know which input method was used.
export interface TranscriptEvent {
    text: string;       // The recognized text (may be partial if isFinal=false)
    isFinal: boolean;   // true when the browser is confident in the result
    timestamp: number;  // Date.now() at recognition time
}

// ── CALLBACK TYPES ───────────────────────────────────────────────────
type TranscriptCallback = (event: TranscriptEvent) => void;
type StatusCallback = (status: STTStatus, errorDetail?: string) => void;

// ── SPEECH RECOGNITION TYPE SHIM ─────────────────────────────────────
// The Web Speech API isn't in TypeScript's standard lib types.
// We declare just enough of the interface to avoid `any` casts.
// In industry, you'd use @types/dom-speech-recognition, but this
// avoids adding a dependency for a small surface area.
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

// ── SPEECH ENGINE CLASS ──────────────────────────────────────────────
export class SpeechEngine {
    // ── PUBLIC STATE ─────────────────────────────────────────────────
    // Whether the browser supports the Web Speech API.
    // UIOverlay reads this to decide whether to show the text-input fallback.
    readonly isSupported: boolean;

    // Whether recognition is currently active.
    // Used by UIOverlay to show listening state.
    private _isRunning = false;

    // ── STATUS ───────────────────────────────────────────────────────
    // Observable status for the UI to react to speech recognition state.
    private _status: STTStatus = 'off';
    private _lastError: string = '';
    private statusListeners: Set<StatusCallback> = new Set();

    // ── PRIVATE STATE ────────────────────────────────────────────────
    // The SpeechRecognition instance — created fresh on each start().
    // We don't reuse instances because some browsers (Chrome) get into
    // bad states if you call start() on an already-stopped instance.
    private recognition: SpeechRecognitionInstance | null = null;

    // Subscriber callbacks — same Set pattern as TuningConfig.
    private listeners: Set<TranscriptCallback> = new Set();

    // Timer ID for the auto-restart delay after errors.
    // Stored so we can cancel it on stop().
    private restartTimer: ReturnType<typeof setTimeout> | null = null;

    // Debounce timer for the 'restarting' status. We delay showing
    // 'restarting' by 800ms so that quick Chrome auto-restarts (~300ms)
    // don't cause a visible flicker in the UI badge.
    private restartDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    // Flag to distinguish intentional stop() from browser auto-stop.
    // When the user calls stop(), we set this to true so the `onend`
    // handler knows NOT to auto-restart.
    private intentionallyStopped = false;

    constructor() {
        // ── DETECT WEB SPEECH API SUPPORT ────────────────────────────
        // Chrome uses the webkit prefix, Safari uses the standard name,
        // Firefox doesn't support it at all (as of 2024).
        this.isSupported =
            'SpeechRecognition' in window ||
            'webkitSpeechRecognition' in window;

        if (!this.isSupported) {
            this._status = 'unsupported';
        }

        console.log(
            `[SpeechEngine] Web Speech API ${this.isSupported ? '✅ supported' : '❌ not supported — text fallback will be used'}`
        );
    }

    // ── PUBLIC API ───────────────────────────────────────────────────

    /**
     * Whether the engine is currently listening for speech.
     */
    get isRunning(): boolean {
        return this._isRunning;
    }

    /**
     * Start speech recognition.
     *
     * If the Web Speech API is supported, this creates a new
     * SpeechRecognition instance and starts it.
     * If not, this is a no-op (the text fallback is always available).
     *
     * NOTE: SpeechRecognition internally requests mic access.
     * Since AudioEngine also calls getUserMedia(), the browser
     * will typically only show one permission prompt (mic access
     * is shared across APIs in the same origin).
     */
    start(): void {
        if (!this.isSupported) {
            // Text fallback mode — mark as "running" so the UI knows
            // to accept text input.
            this._isRunning = true;
            this.setStatus('unsupported');
            console.log('[SpeechEngine] Started in text-input fallback mode');
            return;
        }

        if (this._isRunning) {
            console.log('[SpeechEngine] Already running, skipping start()');
            return;
        }

        this.intentionallyStopped = false;
        this.createRecognition();
    }

    /**
     * Stop speech recognition.
     *
     * Cleans up the recognition instance and cancels any pending
     * restart timers.
     */
    stop(): void {
        this.intentionallyStopped = true;
        this._isRunning = false;

        // Cancel any pending restart timer
        if (this.restartTimer !== null) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }

        // Cancel debounced 'restarting' status
        if (this.restartDebounceTimer !== null) {
            clearTimeout(this.restartDebounceTimer);
            this.restartDebounceTimer = null;
        }

        // Stop the recognition instance
        if (this.recognition) {
            try {
                this.recognition.abort();
            } catch {
                // Some browsers throw if recognition isn't active — safe to ignore.
            }
            this.recognition = null;
        }

        this.setStatus('off');
        console.log('[SpeechEngine] Stopped');
    }

    /**
     * Register a callback to receive transcript events.
     * Returns an unsubscribe function (same pattern as TuningConfig.onChange).
     *
     * Usage:
     *   const unsub = speechEngine.onTranscript((event) => {
     *       console.log(event.text, event.isFinal);
     *   });
     *   // later: unsub();
     */
    onTranscript(callback: TranscriptCallback): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Subscribe to status changes (listening, restarting, error, off).
     * Returns an unsubscribe function.
     */
    onStatusChange(callback: StatusCallback): () => void {
        this.statusListeners.add(callback);
        // Immediately fire with current status so subscriber gets initial state
        callback(this._status, this._lastError);
        return () => this.statusListeners.delete(callback);
    }

    /** Current STT status. */
    get status(): STTStatus {
        return this._status;
    }

    /** Last error detail string (e.g. 'network', 'not-allowed'). */
    get lastError(): string {
        return this._lastError;
    }

    /**
     * Submit text manually (used by the text-input fallback).
     * Emits a TranscriptEvent with isFinal=true, as if the user
     * had spoken the text and the browser confirmed it.
     */
    submitText(text: string): void {
        if (!text.trim()) return;

        const event: TranscriptEvent = {
            text: text.trim(),
            isFinal: true,
            timestamp: Date.now(),
        };

        this.emit(event);
    }

    // ── PRIVATE METHODS ──────────────────────────────────────────────

    /**
     * Create and configure a new SpeechRecognition instance.
     *
     * WHY CREATE FRESH EACH TIME?
     * Chrome's SpeechRecognition can enter broken states if you call
     * start() on a previously-stopped instance. Creating a new one
     * each time is the most reliable approach.
     */
    private createRecognition(): void {
        // Get the constructor (webkit-prefixed in Chrome/Edge)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- vendor-prefixed SpeechRecognition
        const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (!SpeechRecognitionCtor) return;

        const recognition: SpeechRecognitionInstance = new SpeechRecognitionCtor();

        // ── CONFIGURATION ────────────────────────────────────────────
        // continuous=true: Don't stop after the first sentence.
        // interimResults=true: Emit partial results as the user speaks,
        //   giving us real-time text even before the browser is confident.
        // lang='en-US': English — can be made configurable later.
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        // ── EVENT HANDLERS ───────────────────────────────────────────

        recognition.onstart = () => {
            this._isRunning = true;
            // Cancel debounced 'restarting' flash — restart succeeded fast
            if (this.restartDebounceTimer !== null) {
                clearTimeout(this.restartDebounceTimer);
                this.restartDebounceTimer = null;
            }
            this.setStatus('listening');
            console.log('[SpeechEngine] 🎤 Recognition started');
        };

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            // The results array accumulates all results since start().
            // resultIndex tells us where new results begin.
            // We iterate from resultIndex to the end to get only new results.
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const transcript = result[0].transcript;
                const isFinal = result.isFinal;

                const transcriptEvent: TranscriptEvent = {
                    text: transcript,
                    isFinal,
                    timestamp: Date.now(),
                };

                this.emit(transcriptEvent);
            }
        };

        recognition.onend = () => {
            // The browser periodically stops recognition (Chrome does this
            // roughly every 60 seconds, or after silence). If we didn't
            // intentionally stop, restart it to keep listening.
            if (!this.intentionallyStopped) {
                console.log('[SpeechEngine] Recognition ended — auto-restarting...');
                // Debounce: only show 'restarting' if restart takes >800ms.
                // This prevents the visible flicker during Chrome's normal
                // ~300ms restart cycle.
                this.restartDebounceTimer = setTimeout(() => {
                    this.restartDebounceTimer = null;
                    if (!this.intentionallyStopped) {
                        this.setStatus('restarting');
                    }
                }, 800);
                // Small delay to avoid rapid restart loops
                this.restartTimer = setTimeout(() => {
                    this.restartTimer = null;
                    if (!this.intentionallyStopped) {
                        this.createRecognition();
                    }
                }, 300);
            } else {
                this._isRunning = false;
                this.setStatus('off');
                console.log('[SpeechEngine] Recognition ended (intentional stop)');
            }
        };

        recognition.onerror = (event: Event & { error: string }) => {
            // Common error types:
            // - 'no-speech': No speech detected for a while. Normal, just restart.
            // - 'audio-capture': Mic not available. Could be permissions issue.
            // - 'not-allowed': User denied mic permission.
            // - 'aborted': We called abort(). Expected during stop().
            // - 'network': Chrome's speech API uses a network service — this
            //   fires when offline. Recognition won't work offline.
            const errorType = event.error;

            if (errorType === 'aborted') {
                // This fires when we call stop() — ignore it.
                return;
            }

            if (errorType === 'no-speech') {
                // Totally normal — user just hasn't said anything.
                // The onend handler will auto-restart.
                console.log('[SpeechEngine] No speech detected — will auto-restart');
                return;
            }

            // Surface error to the UI — 'network', 'not-allowed', etc.
            this._lastError = errorType;
            this.setStatus('error', errorType);
            console.warn(`[SpeechEngine] ⚠️ Error: "${errorType}"`);

            // For all other errors, try to restart after a delay.
            // The 1-second delay prevents rapid crash loops if the error
            // is persistent (e.g., mic permission denied).
            if (!this.intentionallyStopped) {
                this.restartTimer = setTimeout(() => {
                    this.restartTimer = null;
                    if (!this.intentionallyStopped) {
                        console.log('[SpeechEngine] Retrying after error...');
                        this.createRecognition();
                    }
                }, 1000);
            }
        };

        // ── START ────────────────────────────────────────────────────
        this.recognition = recognition;

        try {
            recognition.start();
        } catch (e) {
            // Can throw if another recognition instance is already running.
            // This is rare but possible during rapid start/stop cycles.
            console.error('[SpeechEngine] Failed to start recognition:', e);
            this._isRunning = false;
        }
    }

    /**
     * Emit a TranscriptEvent to all registered listeners.
     * Also logs to console for easy debugging.
     */
    private emit(event: TranscriptEvent): void {
        // Console log with visual distinction between interim and final
        const prefix = event.isFinal ? '✅ FINAL' : '💬 interim';
        console.log(`[SpeechEngine] ${prefix}: "${event.text}"`);

        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (e) {
                // Don't let a bad listener crash the engine.
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
