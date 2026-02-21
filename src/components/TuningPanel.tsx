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
import { MORPH_TARGET_NAMES } from '../engine/MorphTargets';
import type { TranscriptEvent } from '../services/SpeechEngine';

// ── COMPONENT PROPS ──────────────────────────────────────────────────
export type CameraType = 'perspective' | 'orthographic';
export type ColorMode = 'white' | 'rainbow';

interface TuningPanelProps {
    config: TuningConfig;
    audioEngine: AudioEngine;

    // ── MORPH TARGET SHAPE CONTROLS ──────────────────────────────────
    // These callback props let the panel trigger shape changes without
    // needing direct access to ParticleSystem. Canvas.tsx wires these
    // to particleSystem.setTarget() and .blendTargets().
    // Optional so existing tests/consumers don't break.
    currentShape?: string;                                       // Active shape name (for dropdown display)
    onShapeChange?: (shapeName: string) => void;                 // Fires when primary dropdown changes
    onBlend?: (shapeA: string, shapeB: string, t: number) => void; // Fires when blend slider moves

    // ── CAMERA CONTROLS ─────────────────────────────────────────────
    // Camera type toggle: perspective or orthographic.
    // Canvas.tsx owns the camera instance; this callback tells it to swap.
    cameraType?: CameraType;
    onCameraTypeChange?: (type: CameraType) => void;

    // ── COLOR MODE ────────────────────────────────────────────────────
    // White = tension-tinted white (default), Rainbow = HSL cycling.
    // Canvas.tsx owns the mode; this callback tells it to swap.
    colorMode?: ColorMode;
    onColorModeChange?: (mode: ColorMode) => void;

    // ── SPEECH TRANSCRIPT ────────────────────────────────────────────
    // The last recognized speech event, passed down from Canvas.tsx.
    // Displayed in a dedicated section so the user can see what the
    // system heard in real time.
    transcript?: TranscriptEvent | null;
}

export function TuningPanel({ config, audioEngine, currentShape, onShapeChange, onBlend, cameraType, onCameraTypeChange, colorMode, onColorModeChange, transcript }: TuningPanelProps) {
    // ── STATE ────────────────────────────────────────────────────────
    // `isOpen` controls the slide-in/out animation.
    const [isOpen, setIsOpen] = useState(false);

    // ── BLEND STATE ─────────────────────────────────────────────────
    // The "Blend To" secondary shape and the interpolation factor.
    // These are local to the panel because blending is a UI-only concern —
    // the actual interpolation happens in ParticleSystem via the onBlend callback.
    const [blendTarget, setBlendTarget] = useState<string>(MORPH_TARGET_NAMES[1]); // default: 'sphere'
    const [blendAmount, setBlendAmount] = useState(0);

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
                    {/* ── SHAPE SECTION (always at top) ───────────── */}
                    {/* This section is rendered separately from the auto-generated
                        parameter sliders because shapes are categorical (dropdown)
                        rather than numeric (slider). It uses the callback props
                        from Canvas rather than the TuningConfig system. */}
                    {onShapeChange && (
                        <div className="tuning-section">
                            <div className="tuning-section-title">🔷 Shape</div>

                            {/* Primary shape selector */}
                            <div className="tuning-shape-row">
                                <label className="tuning-label" htmlFor="tuning-shape-primary">
                                    Target
                                </label>
                                <select
                                    id="tuning-shape-primary"
                                    className="tuning-select"
                                    value={currentShape || 'ring'}
                                    onChange={(e) => {
                                        // When user picks a new primary shape, reset blend
                                        // to 0 so the shape snaps cleanly to the selection.
                                        setBlendAmount(0);
                                        onShapeChange(e.target.value);
                                    }}
                                >
                                    {MORPH_TARGET_NAMES.map(name => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Blend-to secondary shape selector */}
                            <div className="tuning-shape-row">
                                <label className="tuning-label" htmlFor="tuning-shape-blend">
                                    Blend To
                                </label>
                                <select
                                    id="tuning-shape-blend"
                                    className="tuning-select"
                                    value={blendTarget}
                                    onChange={(e) => {
                                        setBlendTarget(e.target.value);
                                        // If blend is non-zero, re-apply with new target.
                                        if (blendAmount > 0 && onBlend) {
                                            onBlend(currentShape || 'ring', e.target.value, blendAmount);
                                        }
                                    }}
                                >
                                    {MORPH_TARGET_NAMES.map(name => (
                                        <option key={name} value={name}>{name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Blend amount slider (0 = fully primary, 1 = fully secondary) */}
                            <div className="tuning-blend-row">
                                <div className="tuning-row-header">
                                    <label className="tuning-label" htmlFor="tuning-shape-blend-slider">
                                        Blend
                                    </label>
                                    <span className="tuning-current-value">
                                        {blendAmount.toFixed(2)}
                                    </span>
                                </div>
                                <input
                                    id="tuning-shape-blend-slider"
                                    className="tuning-slider"
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.01}
                                    value={blendAmount}
                                    onChange={(e) => {
                                        const t = parseFloat(e.target.value);
                                        setBlendAmount(t);
                                        if (t === 0) {
                                            // Snap back to pure primary shape
                                            onShapeChange(currentShape || 'ring');
                                        } else if (onBlend) {
                                            onBlend(currentShape || 'ring', blendTarget, t);
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {/* ── SPEECH TRANSCRIPT SECTION ──────────────── */}
                    {/* Shows what the speech recognition engine heard.
                        This gives the user immediate feedback that their
                        speech is being captured, and later will show how
                        it maps to shapes via the KeywordClassifier. */}
                    <div className="tuning-section">
                        <div className="tuning-section-title">🎤 Speech</div>
                        <div className="tuning-transcript">
                            {transcript ? (
                                <>
                                    <span className={`tuning-transcript-text ${transcript.isFinal ? 'final' : 'interim'}`}>
                                        "{transcript.text}"
                                    </span>
                                    <span className="tuning-transcript-status">
                                        {transcript.isFinal ? '✅ final' : '⏳ listening...'}
                                    </span>
                                </>
                            ) : (
                                <span className="tuning-transcript-hint">
                                    Click "Start Listening" and speak…
                                </span>
                            )}
                        </div>
                    </div>

                    {/* ── CAMERA TYPE TOGGLE ─────────────────────── */}
                    {/* Rendered separately because camera type is categorical
                        (perspective vs orthographic), not numeric. The cameraZ
                        slider is auto-generated from PARAM_DEFS below. */}
                    {onCameraTypeChange && (
                        <div className="tuning-section">
                            <div className="tuning-section-title">📷 Camera</div>
                            <div className="tuning-shape-row">
                                <label className="tuning-label" htmlFor="tuning-camera-type">
                                    Projection
                                </label>
                                <select
                                    id="tuning-camera-type"
                                    className="tuning-select"
                                    value={cameraType || 'perspective'}
                                    onChange={(e) => onCameraTypeChange(e.target.value as CameraType)}
                                >
                                    <option value="perspective">Perspective</option>
                                    <option value="orthographic">Orthographic</option>
                                </select>
                            </div>
                        </div>
                    )}

                    {/* ── COLOR MODE TOGGLE ──────────────────────── */}
                    {/* White = tension-tinted white, Rainbow = HSL cycling
                        per particle based on angular position. */}
                    {onColorModeChange && (
                        <div className="tuning-section">
                            <div className="tuning-section-title">🎨 Color Mode</div>
                            <div className="tuning-shape-row">
                                <label className="tuning-label" htmlFor="tuning-color-mode">
                                    Mode
                                </label>
                                <select
                                    id="tuning-color-mode"
                                    className="tuning-select"
                                    value={colorMode || 'white'}
                                    onChange={(e) => onColorModeChange(e.target.value as ColorMode)}
                                >
                                    <option value="white">White</option>
                                    <option value="rainbow">Rainbow</option>
                                </select>
                            </div>
                        </div>
                    )}

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
