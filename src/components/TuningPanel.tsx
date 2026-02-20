/**
 * TuningPanel — Collapsible sidebar for real-time parameter tuning.
 *
 * WHY THIS PATTERN?
 * ─────────────────
 * In creative coding and game dev, "tweaking panels" (dat.gui, lil-gui,
 * Tweakpane, Unity Inspector) are essential. They let you iterate on
 * visual parameters 100x faster than edit-save-refresh cycles.
 *
 * This panel reads parameter definitions from TuningConfig (the singleton)
 * and auto-generates sliders. When you find settings you like, "Copy Config"
 * exports them as JSON so you can paste them into source code as new defaults.
 *
 * ARCHITECTURE:
 * ─────────────
 * - TuningConfig holds values + emits change events
 * - TuningPanel subscribes to changes for React re-renders
 * - Sliders call config.set() on input → uniforms update next frame
 * - AudioEngine features are read via audioEngine prop for live display
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { TuningConfig, PARAM_DEFS } from '../services/TuningConfig';
import type { ParamDef } from '../services/TuningConfig';
import { AudioEngine } from '../services/AudioEngine';

// ── COMPONENT PROPS ──────────────────────────────────────────────────
interface TuningPanelProps {
    config: TuningConfig;
    audioEngine: AudioEngine;
}

export function TuningPanel({ config, audioEngine }: TuningPanelProps) {
    // ── STATE ────────────────────────────────────────────────────────
    // `isOpen` controls the slide-in/out animation.
    const [isOpen, setIsOpen] = useState(false);

    // `revision` is a counter that increments on every config change,
    // forcing React to re-render and show the latest slider values.
    // This is simpler than tracking every parameter individually.
    const [revision, setRevision] = useState(0);

    // `pasteText` holds the text in the "Paste Config" input field.
    const [pasteText, setPasteText] = useState('');

    // `copyFeedback` shows brief "Copied!" confirmation after copy.
    const [copyFeedback, setCopyFeedback] = useState(false);

    // Live audio feature values for display next to audio sliders.
    const [liveFeatures, setLiveFeatures] = useState({
        energy: 0, tension: 0, urgency: 0, breathiness: 0
    });

    // Ref for the panel div to detect outside clicks.
    const panelRef = useRef<HTMLDivElement>(null);

    // ── SUBSCRIBE TO CONFIG CHANGES ──────────────────────────────────
    // When any slider changes (including from Paste Config or Reset),
    // increment revision so React re-reads all values from config.
    useEffect(() => {
        const unsub = config.onChange(() => {
            setRevision(r => r + 1);
        });
        return unsub;
    }, [config]);

    // ── LIVE AUDIO FEATURE POLLING ───────────────────────────────────
    // Poll audio features at ~30fps for the live value display.
    // We use setInterval instead of rAF because we only need ~30fps
    // for display purposes, and this avoids coupling to the render loop.
    useEffect(() => {
        if (!isOpen) return; // Don't poll when panel is closed.

        const interval = setInterval(() => {
            const f = audioEngine.getFeatures();
            setLiveFeatures({
                energy: f.energy,
                tension: f.tension,
                urgency: f.urgency,
                breathiness: f.breathiness,
            });
        }, 33); // ~30fps

        return () => clearInterval(interval);
    }, [isOpen, audioEngine]);

    // ── CLICK OUTSIDE TO CLOSE ───────────────────────────────────────
    // Close the panel when clicking the overlay (backdrop area).
    const handleOverlayClick = useCallback(() => {
        setIsOpen(false);
    }, []);

    // ── COPY CONFIG ──────────────────────────────────────────────────
    // Copy all current parameter values as formatted JSON to clipboard.
    const handleCopy = useCallback(async () => {
        const json = JSON.stringify(config.toJSON(), null, 2);
        try {
            await navigator.clipboard.writeText(json);
            setCopyFeedback(true);
            setTimeout(() => setCopyFeedback(false), 1500);
        } catch {
            // Fallback: prompt with the text if clipboard API fails.
            window.prompt('Copy this config:', json);
        }
    }, [config]);

    // ── PASTE CONFIG ─────────────────────────────────────────────────
    // Parse pasted JSON and apply all values to the config.
    const handlePaste = useCallback(() => {
        try {
            const json = JSON.parse(pasteText);
            config.fromJSON(json);
            setPasteText('');
        } catch {
            alert('Invalid JSON — please paste a valid config object.');
        }
    }, [config, pasteText]);

    // ── RESET ALL ────────────────────────────────────────────────────
    const handleReset = useCallback(() => {
        config.resetAll();
    }, [config]);

    // ── GROUP PARAMETERS BY SECTION ──────────────────────────────────
    // Group PARAM_DEFS by their `group` field to render sections.
    const groups = new Map<string, ParamDef[]>();
    for (const def of PARAM_DEFS) {
        if (!groups.has(def.group)) groups.set(def.group, []);
        groups.get(def.group)!.push(def);
    }

    // ── HELPER: Get the live audio value for a feature key ───────────
    const getLiveValue = (key: string): number | null => {
        if (key === 'audioInfluence.energy' || key === 'audioSmoothing.energy') return liveFeatures.energy;
        if (key === 'audioInfluence.tension' || key === 'audioSmoothing.tension') return liveFeatures.tension;
        if (key === 'audioInfluence.urgency' || key === 'audioSmoothing.urgency') return liveFeatures.urgency;
        if (key === 'audioInfluence.breathiness' || key === 'audioSmoothing.breathiness') return liveFeatures.breathiness;
        return null;
    };

    // ── RENDER ────────────────────────────────────────────────────────
    // revision is used as a dependency to force re-reads from config.
    void revision;

    return (
        <>
            {/* ── GEAR BUTTON (always visible) ─────────────────────── */}
            <button
                className="tuning-gear-btn"
                onClick={() => setIsOpen(!isOpen)}
                title="Tuning Panel"
                aria-label="Toggle tuning panel"
            >
                ⚙
            </button>

            {/* ── OVERLAY (click to close, only when panel is open) ── */}
            {isOpen && (
                <div
                    className="tuning-overlay"
                    onClick={handleOverlayClick}
                />
            )}

            {/* ── SLIDE-IN PANEL ───────────────────────────────────── */}
            <div
                ref={panelRef}
                className={`tuning-panel ${isOpen ? 'open' : ''}`}
            >
                <div className="tuning-panel-header">
                    <span>⚙ Tuning Panel</span>
                    <button
                        className="tuning-close-btn"
                        onClick={() => setIsOpen(false)}
                        aria-label="Close tuning panel"
                    >
                        ✕
                    </button>
                </div>

                <div className="tuning-panel-content">
                    {/* ── PARAMETER SECTIONS ───────────────────────── */}
                    {Array.from(groups.entries()).map(([groupName, defs]) => (
                        <div key={groupName} className="tuning-section">
                            <div className="tuning-section-title">{groupName}</div>
                            {defs.map(def => {
                                const value = config.get(def.key);
                                const liveVal = getLiveValue(def.key);

                                return (
                                    <div key={def.key} className="tuning-row">
                                        <div className="tuning-row-header">
                                            <label
                                                className="tuning-label"
                                                htmlFor={`tuning-${def.key}`}
                                            >
                                                {def.label}
                                            </label>
                                            <div className="tuning-values">
                                                {/* Show live audio feature value if this is an audio param */}
                                                {liveVal !== null && (
                                                    <span className="tuning-live-value">
                                                        {liveVal.toFixed(3)}
                                                    </span>
                                                )}
                                                <span className="tuning-current-value">
                                                    {value.toFixed(
                                                        def.step < 0.01 ? 3 :
                                                            def.step < 0.1 ? 2 :
                                                                def.step < 1 ? 1 : 0
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                        <input
                                            id={`tuning-${def.key}`}
                                            className="tuning-slider"
                                            type="range"
                                            min={def.min}
                                            max={def.max}
                                            step={def.step}
                                            value={value}
                                            onChange={(e) => {
                                                config.set(def.key, parseFloat(e.target.value));
                                            }}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    ))}

                    {/* ── ACTION BUTTONS ────────────────────────────── */}
                    <div className="tuning-section tuning-actions">
                        <div className="tuning-section-title">💾 Presets</div>

                        <button
                            className="tuning-btn tuning-btn-reset"
                            onClick={handleReset}
                        >
                            Reset All to Defaults
                        </button>

                        <button
                            className="tuning-btn tuning-btn-copy"
                            onClick={handleCopy}
                        >
                            {copyFeedback ? '✓ Copied!' : 'Copy Config (JSON)'}
                        </button>

                        <div className="tuning-paste-group">
                            <textarea
                                className="tuning-paste-input"
                                placeholder="Paste config JSON here..."
                                value={pasteText}
                                onChange={(e) => setPasteText(e.target.value)}
                                rows={3}
                            />
                            <button
                                className="tuning-btn tuning-btn-paste"
                                onClick={handlePaste}
                                disabled={!pasteText.trim()}
                            >
                                Apply Pasted Config
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
