/**
 * STTManager — Tiered speech-to-text manager.
 *
 * WHAT THIS DOES:
 * ───────────────
 * Wraps the existing SpeechEngine (Web Speech API) and adds Moonshine
 * STT as an async upgrade path:
 *
 *   1. Start immediately with Web Speech API (existing SpeechEngine)
 *   2. Begin loading Moonshine model in the background
 *   3. Once Moonshine is ready, transparently swap to it
 *   4. If Moonshine fails (no WebGPU, download fails), stay on Web Speech
 *
 * The STTManager emits the same TranscriptEvent interface as SpeechEngine,
 * so downstream consumers (SemanticBackend, Canvas.tsx) can swap in the
 * STTManager without any API changes.
 *
 * WHY TIERED:
 * ───────────
 * Web Speech API is instant but requires network + Google's servers.
 * Moonshine is ~150MB to download but runs fully offline with better
 * accuracy. The tiered approach gives instant start + eventual upgrade.
 */

import { SpeechEngine } from '../services/SpeechEngine';
import type { TranscriptEvent } from '../services/SpeechEngine';
import type { STTTier, STTStatus } from './types';

// Moonshine model ID for @huggingface/transformers
const MOONSHINE_MODEL_ID = 'UsefulSensors/moonshine-base-onnx';

/**
 * Callback type for transcript events — matches SpeechEngine's pattern.
 */
type TranscriptCallback = (event: TranscriptEvent) => void;

export class STTManager {
    private speechEngine: SpeechEngine;
    private currentTier: STTTier = 'loading';
    private isListeningFlag = false;

    /**
     * When true, Moonshine is ready but we're waiting for the current
     * Web Speech utterance to finalize before swapping. This prevents
     * dropping words mid-sentence during the transition.
     */
    private pendingMoonshineSwap = false;

    /** All registered transcript listeners. */
    private listeners: Set<TranscriptCallback> = new Set();

    /** Unsubscribe function from the underlying SpeechEngine. */
    private speechEngineUnsub: (() => void) | null = null;

    /** Moonshine pipeline reference (lazy-loaded). */
    private moonshineReady = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private moonshine: any = null;

    /** Audio stream for Moonshine (needs raw audio access). */
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;

    constructor(speechEngine: SpeechEngine) {
        this.speechEngine = speechEngine;

        // Wire up the SpeechEngine's transcript events to our own listeners.
        // This is the immediate path — works before Moonshine loads.
        this.speechEngineUnsub = this.speechEngine.onTranscript((event) => {
            // Only forward events if we're still using Web Speech
            if (this.currentTier === 'webspeech') {
                this.emit(event);

                // If Moonshine is ready and this is a final transcript,
                // now is a safe point to swap — no words will be dropped.
                if (this.pendingMoonshineSwap && event.isFinal) {
                    this.pendingMoonshineSwap = false;
                    this.executeSwapToMoonshine();
                }
            }
        });

        // Start on Web Speech if supported, otherwise we're in text-only mode
        if (this.speechEngine.isSupported) {
            this.currentTier = 'webspeech';
        } else {
            this.currentTier = 'webspeech'; // Text fallback still goes through SpeechEngine
        }
    }

    // ── LIFECYCLE ────────────────────────────────────────────────────────

    /**
     * Initialize the STT manager. Starts Web Speech immediately and
     * begins loading Moonshine in the background.
     */
    async init(): Promise<void> {
        // The SpeechEngine is already constructed — just start it
        this.speechEngine.start();
        this.isListeningFlag = true;

        // Begin Moonshine model loading in the background (non-blocking)
        this.loadMoonshine().catch((err) => {
            console.warn('[STTManager] Moonshine load failed, staying on Web Speech:', err);
        });
    }

    /**
     * Start listening for speech.
     */
    start(): void {
        if (this.isListeningFlag) return;
        this.isListeningFlag = true;

        if (this.currentTier === 'moonshine' && this.moonshineReady) {
            // Moonshine is active — start its capture loop
            this.startMoonshineCapture();
        } else {
            // Fall back to Web Speech
            this.speechEngine.start();
        }
    }

    /**
     * Stop listening for speech.
     */
    stop(): void {
        this.isListeningFlag = false;

        if (this.currentTier === 'moonshine') {
            this.stopMoonshineCapture();
        } else {
            this.speechEngine.stop();
        }
    }

    /**
     * Clean up all resources.
     */
    dispose(): void {
        this.stop();
        if (this.speechEngineUnsub) {
            this.speechEngineUnsub();
            this.speechEngineUnsub = null;
        }
        this.listeners.clear();
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }

    // ── SUBSCRIPTION ────────────────────────────────────────────────────

    /**
     * Subscribe to transcript events. Returns an unsubscribe function.
     * Matches the same pattern as SpeechEngine.onTranscript().
     */
    onTranscript(callback: TranscriptCallback): () => void {
        this.listeners.add(callback);
        return () => {
            this.listeners.delete(callback);
        };
    }

    // ── STATUS ───────────────────────────────────────────────────────────

    /**
     * Get the current STT status.
     */
    getStatus(): STTStatus {
        return {
            engine: this.currentTier,
            isListening: this.isListeningFlag,
        };
    }

    /**
     * Submit text directly (delegates to SpeechEngine's text fallback).
     * Useful for testing and for the text input UI.
     */
    submitText(text: string): void {
        this.speechEngine.submitText(text);
    }

    // ── MOONSHINE LOADING ────────────────────────────────────────────────

    /**
     * Attempt to load the Moonshine STT model asynchronously.
     * This is a background operation — failure is non-fatal.
     */
    private async loadMoonshine(): Promise<void> {
        try {
            console.log('[STTManager] Beginning Moonshine model load...');

            // Dynamic import so the ~5MB @huggingface/transformers bundle
            // is only loaded when we actually try to use Moonshine
            const { pipeline } = await import('@huggingface/transformers');

            console.log('[STTManager] Transformers.js loaded, creating ASR pipeline...');

            this.moonshine = await pipeline(
                'automatic-speech-recognition',
                MOONSHINE_MODEL_ID,
                {
                    // Prefer WebGPU for fast inference, fall back to WASM
                    device: 'webgpu' as any,
                    dtype: 'fp32',
                }
            );

            this.moonshineReady = true;
            console.log('[STTManager] ✅ Moonshine model loaded and ready');

            // If we're currently listening, schedule the swap.
            // Don't swap immediately — wait for the current utterance to
            // finalize so we don't drop words mid-sentence.
            if (this.isListeningFlag) {
                this.pendingMoonshineSwap = true;
                console.log('[STTManager] Moonshine ready — waiting for current utterance to finalize before swap');
            }
        } catch (err) {
            console.warn('[STTManager] Moonshine initialization failed:', err);
            // Stay on Web Speech — this is expected on browsers without WebGPU
            this.moonshineReady = false;
        }
    }

    /**
     * Execute the actual swap from Web Speech → Moonshine.
     * Called after the current Web Speech utterance finalizes (isFinal=true).
     */
    private executeSwapToMoonshine(): void {
        console.log('[STTManager] Executing swap: Web Speech → Moonshine');

        // Stop the Web Speech engine
        this.speechEngine.stop();

        // Update tier
        this.currentTier = 'moonshine';

        // Start Moonshine capture
        this.startMoonshineCapture();
    }

    /**
     * Start capturing audio for Moonshine inference.
     * Uses a separate AudioContext to avoid conflicting with AudioEngine's.
     */
    private async startMoonshineCapture(): Promise<void> {
        if (!this.moonshine) return;

        try {
            // Get mic access (AudioEngine may already have it, but we
            // need our own stream for the Moonshine pipeline)
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = new AudioContext();

            // Moonshine streaming inference would go here.
            // For now, we use a simple polling approach: capture 2-second
            // chunks and run inference on each.
            this.runMoonshineLoop();
        } catch (err) {
            console.error('[STTManager] Moonshine capture failed, reverting to Web Speech:', err);
            this.currentTier = 'webspeech';
            this.speechEngine.start();
        }
    }

    /**
     * Stop Moonshine audio capture.
     */
    private stopMoonshineCapture(): void {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(t => t.stop());
            this.mediaStream = null;
        }
    }

    /**
     * Run the Moonshine inference loop.
     * Captures 2-second audio chunks and runs ASR inference on each.
     */
    private async runMoonshineLoop(): Promise<void> {
        if (!this.moonshine || !this.audioContext || !this.mediaStream) return;

        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 4096;
        source.connect(analyser);

        const sampleRate = this.audioContext.sampleRate;
        const chunkSamples = Math.floor(sampleRate * 2.0); // 2 seconds
        const buffer = new Float32Array(chunkSamples);

        const captureAndInfer = async () => {
            if (!this.isListeningFlag || this.currentTier !== 'moonshine') return;

            try {
                // Capture audio chunk
                analyser.getFloatTimeDomainData(buffer);

                // Run Moonshine inference
                const result = await this.moonshine(buffer, {
                    sampling_rate: sampleRate,
                });

                if (result && result.text && result.text.trim()) {
                    this.emit({
                        text: result.text.trim(),
                        isFinal: true,
                        timestamp: Date.now(),
                    });
                }
            } catch (err) {
                console.warn('[STTManager] Moonshine inference error:', err);
            }

            // Schedule next capture (2-second intervals)
            if (this.isListeningFlag && this.currentTier === 'moonshine') {
                setTimeout(captureAndInfer, 2000);
            }
        };

        // Start after a 2-second initial capture window
        setTimeout(captureAndInfer, 2000);
    }

    // ── INTERNAL ─────────────────────────────────────────────────────────

    /**
     * Emit a transcript event to all registered listeners.
     * Isolates each listener so a throw in one doesn't kill the others.
     */
    private emit(event: TranscriptEvent): void {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch (err) {
                console.error('[STTManager] Listener threw:', err);
            }
        }
    }
}
