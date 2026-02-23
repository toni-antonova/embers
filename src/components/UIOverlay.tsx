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

// ── COMPONENT PROPS ──────────────────────────────────────────────────
interface UIOverlayProps {
    audioEngine: AudioEngine;
    speechEngine: SpeechEngine;
}

export function UIOverlay({ audioEngine, speechEngine }: UIOverlayProps) {
    // ── STATE ────────────────────────────────────────────────────────
    const [isListening, setIsListening] = useState(false);
    const [denied, setDenied] = useState(false);
    const deniedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Clean up denied timer on unmount
    useEffect(() => {
        return () => { if (deniedTimerRef.current) clearTimeout(deniedTimerRef.current); };
    }, []);

    // Text-input fallback state (only used when Web Speech API is unavailable).
    const [fallbackText, setFallbackText] = useState('');

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



    // ── TEXT FALLBACK SUBMIT ─────────────────────────────────────────
    // Handles Enter key and button click for the text-input fallback.
    const handleFallbackSubmit = () => {
        if (!fallbackText.trim()) return;
        speechEngine.submitText(fallbackText);
        setFallbackText('');
    };

    // ── RENDER ────────────────────────────────────────────────────────
    return (
        <div className="ui-overlay">

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

            {/* ── TEXT FALLBACK (only when Speech API unavailable) ── */}
            {/* When the Web Speech API isn't available (Firefox, etc.),
                show a text input so the user can still type words that
                get processed by the semantic pipeline. The form only
                appears when listening is active (or always in fallback). */}
            {!speechEngine.isSupported && isListening && (
                <div className="speech-fallback-container">
                    <input
                        className="speech-fallback-input"
                        type="text"
                        placeholder="Type words here (speech not supported in this browser)..."
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
