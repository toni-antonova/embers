/**
 * UIOverlay — Heads-up display for audio features, mic control, and speech input.
 *
 * WHY THIS COMPONENT?
 * ────────────────────
 * The UIOverlay sits on top of the WebGL canvas and provides the primary
 * user-facing controls. It's deliberately minimal and semi-transparent
 * so it doesn't distract from the particle visualization.
 *
 * RESPONSIBILITIES:
 * ─────────────────
 * 1. Debug bars: Real-time audio feature levels (energy, tension, urgency, breath)
 * 2. Mic button: Starts/stops BOTH AudioEngine AND SpeechEngine simultaneously
 * 3. Transcript display: Shows the last recognized speech as ghost text
 * 4. Text fallback: Shows a text input when Web Speech API isn't available
 *
 * ARCHITECTURE:
 * ─────────────
 * - AudioEngine handles HOW speech sounds (Meyda features)
 * - SpeechEngine handles WHAT is being said (transcription)
 * - Both start/stop together from the same mic button
 * - The transcript display uses key-based re-rendering to trigger
 *   the CSS fade-in animation on each new result
 */

import { useState, useRef, useEffect } from 'react';
import { AudioEngine } from '../services/AudioEngine';
import { SpeechEngine } from '../services/SpeechEngine';
import type { STTStatus, TranscriptEvent } from '../services/SpeechEngine';
import type { TuningConfig } from '../services/TuningConfig';
import type { SemanticEvent } from '../services/SemanticBackend';
import {
    accumulateGhostWords,
    cleanupExpiredWords,
    ghostWordOpacity,
} from '../services/GhostTranscript';
import type { GhostWord } from '../services/GhostTranscript';

// ── COMPONENT PROPS ──────────────────────────────────────────────────
const GHOST_CLEANUP_MS = 200;

interface UIOverlayProps {
    audioEngine: AudioEngine;
    speechEngine: SpeechEngine;
    tuningConfig: TuningConfig;
    lastTranscript: TranscriptEvent | null;
    lastSemanticEvent: SemanticEvent | null;
}

export function UIOverlay({ audioEngine, speechEngine, tuningConfig, lastTranscript, lastSemanticEvent }: UIOverlayProps) {
    // ── STATE ────────────────────────────────────────────────────────
    const [isListening, setIsListening] = useState(false);
    const [denied, setDenied] = useState(false);
    const deniedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Simple/Complex mode toggle — reads initial state from TuningConfig
    const [complexMode, setComplexMode] = useState(() => tuningConfig.complexMode);

    // Clean up denied timer on unmount
    useEffect(() => {
        return () => { if (deniedTimerRef.current) clearTimeout(deniedTimerRef.current); };
    }, []);

    const [fallbackText, setFallbackText] = useState('');

    // STT status state — driven by SpeechEngine's onStatusChange callback
    const [sttStatus, setSttStatus] = useState<STTStatus>('off');
    const [sttError, setSttError] = useState('');

    // ── GHOST TRANSCRIPT STATE ──────────────────────────────────────
    const [ghostWords, setGhostWords] = useState<GhostWord[]>([]);
    const ghostIdCounter = useRef(0);
    const ghostScrollRef = useRef<HTMLDivElement>(null);
    const prevTranscriptRef = useRef<string | null>(null);

    // Accumulate words from new final transcripts
    useEffect(() => {
        if (!lastTranscript || !lastTranscript.isFinal) return;
        if (lastTranscript.text === prevTranscriptRef.current) return;
        prevTranscriptRef.current = lastTranscript.text;

        setGhostWords(prev => {
            const result = accumulateGhostWords(prev, lastTranscript, lastSemanticEvent, ghostIdCounter.current);
            ghostIdCounter.current = result.nextId;
            return result.words;
        });
    }, [lastTranscript, lastSemanticEvent]);

    // Auto-scroll ghost transcript to bottom
    useEffect(() => {
        if (ghostScrollRef.current) {
            ghostScrollRef.current.scrollTop = ghostScrollRef.current.scrollHeight;
        }
    }, [ghostWords]);

    // Periodic cleanup of expired ghost words
    useEffect(() => {
        const timer = setInterval(() => {
            setGhostWords(prev => cleanupExpiredWords(prev));
        }, GHOST_CLEANUP_MS);
        return () => clearInterval(timer);
    }, []);

    // ── PROCESSING INDICATOR ─────────────────────────────────────────
    // Shows a shimmer bar when a final transcript was received,
    // indicating the model is processing the input.
    const [isProcessing, setIsProcessing] = useState(false);
    const processingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!lastTranscript || !lastTranscript.isFinal) return;
        setIsProcessing(true);
        // Clear any existing timeout
        if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
        // Auto-clear after 2.5s (typical server response time)
        processingTimerRef.current = setTimeout(() => setIsProcessing(false), 2500);
    }, [lastTranscript]);

    // Clean up processing timer on unmount
    useEffect(() => {
        return () => { if (processingTimerRef.current) clearTimeout(processingTimerRef.current); };
    }, []);

    // ── MODE TOGGLE ──────────────────────────────────────────────────
    // Toggles between Simple (pre-built shapes) and Complex (server-rendered).
    // Writes directly to TuningConfig, which persists to localStorage.
    const toggleMode = () => {
        const next = !complexMode;
        setComplexMode(next);
        tuningConfig.complexMode = next;
    };

    // ── MIC TOGGLE ───────────────────────────────────────────────────
    // Starts/stops BOTH audio analysis AND speech recognition together.
    // This ensures mic permission is requested once (AudioEngine's
    // getUserMedia) and both systems share the same lifecycle.
    const toggleMic = async () => {
        if (isListening) {
            audioEngine.stop();
            speechEngine.stop();
            setIsListening(false);
        } else {
            try {
                await audioEngine.start();
                speechEngine.start();
                setIsListening(true);
                setDenied(false);
            } catch {
                // Microphone permission denied or unavailable.
                setDenied(true);
                // Clear any existing timer
                if (deniedTimerRef.current) clearTimeout(deniedTimerRef.current);
                // Auto-dismiss tooltip after 3 seconds.
                deniedTimerRef.current = setTimeout(() => setDenied(false), 3000);
            }
        }
    };

    // Subscribe to STT status changes for the visible indicator.
    // NOTE: We do NOT stop AudioEngine on STT errors. The audio analysis
    // pipeline (volume, pitch, energy) works fine on mobile — only the
    // Web Speech API's speech-to-text is unavailable. The STT badge will
    // show the error, but the particle visualization keeps responding to
    // audio features.
    useEffect(() => {
        const unsub = speechEngine.onStatusChange((status, errorDetail) => {
            setSttStatus(status);
            if (errorDetail) setSttError(errorDetail);
        });
        return unsub;
    }, [speechEngine]);



    // ── TEXT FALLBACK SUBMIT ─────────────────────────────────────────
    // Handles Enter key and button click for the text-input fallback.
    const handleFallbackSubmit = () => {
        if (!fallbackText.trim()) return;
        speechEngine.submitText(fallbackText);
        setFallbackText('');
    };

    // Is the engine currently connecting to the WebSocket fallback?
    const isConnectingWS = sttStatus === 'connecting-ws';

    // ── RENDER ────────────────────────────────────────────────────────
    return (
        <div className="ui-overlay">

            {/* ── TOP-RIGHT CONTROLS (toggle + STT status) ─────────── */}
            <div className="top-right-controls">
                {/* ── MODE TOGGLE (Simple / Complex) ──────────────── */}
                <div
                    className={`mode-toggle ${complexMode ? 'mode-toggle--complex' : ''}`}
                    onClick={toggleMode}
                    role="switch"
                    aria-checked={complexMode}
                    aria-label={complexMode ? 'Switch to Simple mode' : 'Switch to Complex mode'}
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleMode(); } }}
                >
                    <span className="mode-toggle__label mode-toggle__label--left">Simple</span>
                    <span className="mode-toggle__thumb" />
                    <span className="mode-toggle__label mode-toggle__label--right">Complex</span>
                </div>

                {/* ── STT STATUS (underneath toggle) ──────────────── */}
                {isListening && (
                    <div className={`stt-status stt-status--${sttStatus}${isConnectingWS ? ' stt-status--loading' : ''}`}>
                        <span className="stt-status__dot" />
                        <span className="stt-status__label">
                            {sttStatus === 'listening' && 'STT active'}
                            {sttStatus === 'restarting' && 'STT restarting…'}
                            {sttStatus === 'error' && `STT error: ${sttError}`}
                            {isConnectingWS && 'Connecting to speech service…'}
                            {sttStatus === 'unsupported' && 'STT unavailable — type below'}
                            {sttStatus === 'off' && 'STT off'}
                        </span>
                    </div>
                )}

                {/* ── GHOST TRANSCRIPT (fading word history) ──────── */}
                {(isListening || ghostWords.length > 0) && (
                    <div
                        ref={ghostScrollRef}
                        className="ghost-transcript"
                    >
                        {ghostWords.length > 0 ? (
                            ghostWords.map(gw => {
                                const opacity = ghostWordOpacity(gw);
                                return (
                                    <span
                                        key={gw.id}
                                        className={`ghost-word${gw.isKeyword ? ' keyword' : ''}`}
                                        style={{ opacity }}
                                    >
                                        {gw.text}
                                    </span>
                                );
                            })
                        ) : (
                            <span className="ghost-transcript-hint">
                                {lastTranscript && !lastTranscript.isFinal
                                    ? 'listening…'
                                    : 'speak to see words…'}
                            </span>
                        )}
                    </div>
                )}

                {/* ── PROCESSING BAR (thinking shimmer) ───────────── */}
                {isProcessing && isListening && (
                    <div className="processing-bar">
                        <div className="processing-bar__fill" />
                    </div>
                )}
            </div>

            {/* ── MIC BUTTON ──────────────────────────────────────── */}
            <button
                className={`mic-button ${isListening ? 'active' : ''}`}
                onClick={toggleMic}
                aria-label={isListening ? 'Stop listening' : 'Start listening'}
            >
                <svg className="mic-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
                {!isListening && <span className="mic-slash" />}
            </button>
            {denied && (
                <span className="mic-tooltip">Microphone access denied</span>
            )}

            {/* ── TEXT FALLBACK ─────────────────────────────────────── */}
            {/* Shows when Web Speech API is unsupported (desktop Firefox)
                or when WebSocket fallback fails */}
            {!speechEngine.isSupported && isListening && (
                <div className="speech-fallback-container">
                    <input
                        className="speech-fallback-input"
                        type="text"
                        placeholder="Type words here (speech not supported)..."
                        value={fallbackText}
                        onChange={(e) => setFallbackText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleFallbackSubmit();
                            }
                        }}
                    />
                    <button
                        className="speech-fallback-submit"
                        onClick={handleFallbackSubmit}
                        disabled={!fallbackText.trim()}
                    >
                        Send
                    </button>
                </div>
            )}
        </div>
    );
}

