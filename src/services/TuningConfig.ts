/**
 * TuningConfig — Central configuration singleton for all tunable parameters.
 *
 * WHY A SINGLETON?
 * ─────────────────
 * In real-time graphics apps, parameters need to be shared across multiple
 * subsystems (particle physics, audio processing, shader uniforms, UI).
 * A singleton config acts as a "single source of truth" that all systems
 * read from, avoiding parameter drift and prop-drilling nightmares.
 *
 * HOW IT WORKS:
 * ─────────────
 * 1. Each parameter has a key, default value, min, max, step, and label.
 * 2. Systems (ParticleSystem, AudioEngine, etc.) call config.get('key')
 *    every frame to read current values.
 * 3. The TuningPanel UI calls config.set('key', value) when sliders move.
 * 4. Listeners are notified on every change (useful for React re-renders).
 * 5. All values persist to localStorage so they survive page refresh.
 * 6. "Copy Config" exports all values as JSON for pasting into source code.
 *
 * INDUSTRY CONTEXT:
 * ─────────────────
 * This pattern is ubiquitous in game engines (Unity Inspector, Unreal Details
 * panel) and creative coding tools (dat.gui, lil-gui, Tweakpane). It lets
 * artists/designers iterate on visual parameters without touching code.
 */

// ── PARAMETER DEFINITION ─────────────────────────────────────────────
// Each tunable parameter is fully described by this interface.
// The UI generates sliders automatically from this metadata.
export interface ParamDef {
    key: string;           // Unique identifier (e.g., "springK")
    label: string;         // Human-readable label for the UI
    defaultValue: number;  // Initial value and reset target
    min: number;           // Slider minimum
    max: number;           // Slider maximum
    step: number;          // Slider granularity
    group: string;         // Section heading in the panel
}

// ── ALL TUNABLE PARAMETERS ───────────────────────────────────────────
// Organized by group. The order here determines the order in the panel.
export const PARAM_DEFS: ParamDef[] = [
    // ── 🔴 PARTICLE APPEARANCE ──────────────────────────────────────
    // These control how the particles *look* — size, opacity, trails.
    {
        key: 'pointSize', label: 'Point Size',
        defaultValue: 3.0, min: 0.5, max: 8, step: 0.5,
        group: '🔴 Particle Appearance'
    },
    {
        key: 'pointOpacity', label: 'Point Opacity',
        defaultValue: 0.7, min: 0.1, max: 1.0, step: 0.05,
        group: '🔴 Particle Appearance'
    },
    {
        // Trail length is controlled by the fade-quad opacity.
        // Lower opacity = more of the previous frame shows through = longer trails.
        // Higher opacity = previous frame fades faster = shorter/no trails.
        key: 'trailLength', label: 'Trail Length (fade)',
        defaultValue: 0.2, min: 0.01, max: 0.3, step: 0.01,
        group: '🔴 Particle Appearance'
    },
    {
        // Formation scale multiplier — scales all morph target positions.
        // 1.0 = default shape size (~3 unit ring radius), 0.5 = half, 2.0 = double.
        // Works for ALL shapes (ring, sphere, quadruped, etc.), not just ring.
        key: 'formationScale', label: 'Formation Scale',
        defaultValue: 1.6, min: 0.2, max: 3.0, step: 0.1,
        group: '🔴 Particle Appearance'
    },

    // ── 🔵 PHYSICS ──────────────────────────────────────────────────
    // These control the particle simulation — spring, drag, noise.
    {
        // Spring constant (Hooke's Law): how strongly particles are pulled
        // back to their morph target position. Higher = snappier, lower = floaty.
        key: 'springK', label: 'Spring Strength (K)',
        defaultValue: 1.5, min: 0.5, max: 10.0, step: 0.5,
        group: '🔵 Physics'
    },
    {
        // Velocity damping. Higher = particles stop faster (snappy).
        // Lower = particles coast longer (floaty, inertial).
        key: 'drag', label: 'Drag',
        defaultValue: 2.5, min: 0.5, max: 5.0, step: 0.25,
        group: '🔵 Physics'
    },
    {
        // Base curl noise amplitude. This is the "idle shimmer" amount.
        // Audio urgency adds on top of this.
        key: 'noiseAmplitude', label: 'Curl Noise Amp (base)',
        defaultValue: 0.25, min: 0.0, max: 1.0, step: 0.05,
        group: '🔵 Physics'
    },
    {
        // Curl noise spatial frequency. Higher = tighter swirl patterns.
        // Audio tension adds on top of this.
        key: 'noiseFrequency', label: 'Curl Noise Frequency',
        defaultValue: 0.8, min: 0.1, max: 3.0, step: 0.1,
        group: '🔵 Physics'
    },
    {
        // Idle breathing amplitude — the gentle "inhale/exhale" pulse
        // that makes the ring feel alive even without audio.
        key: 'breathingAmplitude', label: 'Breathing Amplitude',
        defaultValue: 0.08, min: 0.0, max: 0.2, step: 0.005,
        group: '🔵 Physics'
    },

    // ── 🟢 AUDIO → VISUAL MAPPING ──────────────────────────────────
    // Influence: multiplier on how much each audio feature affects visuals.
    //   0 = feature is muted (no visual effect)
    //   1 = default strength
    //   2 = doubled effect
    //
    // Smoothing: EMA alpha for each feature.
    //   Lower = more responsive/jittery (mic visualizer feel)
    //   Higher = smoother/laggier (ambient feel)
    {
        key: 'audioInfluence.energy', label: 'Energy Influence',
        defaultValue: 1.0, min: 0.0, max: 2.0, step: 0.1,
        group: '🟢 Audio → Energy'
    },
    {
        key: 'audioSmoothing.energy', label: 'Energy Smoothing',
        defaultValue: 0.55, min: 0.1, max: 0.99, step: 0.01,
        group: '🟢 Audio → Energy'
    },
    {
        key: 'audioInfluence.tension', label: 'Tension Influence',
        defaultValue: 1.0, min: 0.0, max: 2.0, step: 0.1,
        group: '🟢 Audio → Tension'
    },
    {
        key: 'audioSmoothing.tension', label: 'Tension Smoothing',
        defaultValue: 0.70, min: 0.1, max: 0.99, step: 0.01,
        group: '🟢 Audio → Tension'
    },
    {
        key: 'audioInfluence.urgency', label: 'Urgency Influence',
        defaultValue: 1.0, min: 0.0, max: 2.0, step: 0.1,
        group: '🟢 Audio → Urgency'
    },
    {
        key: 'audioSmoothing.urgency', label: 'Urgency Smoothing',
        defaultValue: 0.35, min: 0.1, max: 0.99, step: 0.01,
        group: '🟢 Audio → Urgency'
    },
    {
        key: 'audioInfluence.breathiness', label: 'Breathiness Influence',
        defaultValue: 1.0, min: 0.0, max: 2.0, step: 0.1,
        group: '🟢 Audio → Breathiness'
    },
    {
        key: 'audioSmoothing.breathiness', label: 'Breathiness Smoothing',
        defaultValue: 0.55, min: 0.1, max: 0.99, step: 0.01,
        group: '🟢 Audio → Breathiness'
    },

    // ── 🟡 POINTER INTERACTION ──────────────────────────────────────
    {
        // Radius around the cursor where particles are repelled.
        key: 'repulsionRadius', label: 'Repulsion Radius',
        defaultValue: 1.5, min: 0.5, max: 5.0, step: 0.25,
        group: '🟡 Pointer Interaction'
    },
    {
        // Strength of the repulsion force.
        key: 'repulsionStrength', label: 'Repulsion Strength',
        defaultValue: 8.0, min: 1.0, max: 20.0, step: 1.0,
        group: '🟡 Pointer Interaction'
    },

    // ── 📷 CAMERA ───────────────────────────────────────────────────
    {
        // Camera distance from origin along the Z axis.
        // Higher = more zoomed out, lower = closer to the particles.
        key: 'cameraZ', label: 'Camera Z Position',
        defaultValue: 9, min: 1, max: 50, step: 0.5,
        group: '📷 Camera'
    },
];

// ── LISTENER TYPE ────────────────────────────────────────────────────
// Called whenever any parameter value changes.
type ConfigListener = (key: string, value: number) => void;

// ── LOCALSTORAGE KEY ─────────────────────────────────────────────────
const STORAGE_KEY = 'dots-tuning-config';

// ── TUNING CONFIG CLASS ──────────────────────────────────────────────
export class TuningConfig {
    // Current parameter values, keyed by param key.
    private values: Map<string, number> = new Map();

    // Subscribers notified on every value change.
    private listeners: Set<ConfigListener> = new Set();

    constructor() {
        // 1. Load defaults from PARAM_DEFS.
        for (const def of PARAM_DEFS) {
            this.values.set(def.key, def.defaultValue);
        }

        // 2. Override with any saved values from localStorage.
        this.loadFromStorage();

        console.log('[TuningConfig] Initialized with', this.values.size, 'parameters');
    }

    // ── GET / SET ────────────────────────────────────────────────────

    /**
     * Get the current value of a parameter.
     * Returns the default if the key doesn't exist (defensive).
     */
    get(key: string): number {
        return this.values.get(key) ?? this.getDefault(key);
    }

    /**
     * Set a parameter value. Notifies all listeners and saves to localStorage.
     * Value is clamped to the parameter's min/max range.
     */
    set(key: string, value: number): void {
        const def = PARAM_DEFS.find(d => d.key === key);
        if (def) {
            // Clamp to valid range to prevent invalid values from UI bugs.
            value = Math.max(def.min, Math.min(def.max, value));
        }
        this.values.set(key, value);

        // Notify all listeners (TuningPanel uses this for re-rendering).
        for (const listener of this.listeners) {
            listener(key, value);
        }

        // Persist to localStorage so settings survive page refresh.
        this.saveToStorage();
    }

    // ── LISTENER MANAGEMENT ──────────────────────────────────────────

    /**
     * Subscribe to all config changes. Returns an unsubscribe function.
     * This follows the React subscription pattern (useSyncExternalStore).
     */
    onChange(listener: ConfigListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    // ── DEFAULTS & RESET ─────────────────────────────────────────────

    /**
     * Get the default value for a parameter key.
     */
    getDefault(key: string): number {
        return PARAM_DEFS.find(d => d.key === key)?.defaultValue ?? 0;
    }

    /**
     * Reset ALL parameters to their defaults.
     * Notifies listeners for each changed parameter.
     */
    resetAll(): void {
        for (const def of PARAM_DEFS) {
            this.values.set(def.key, def.defaultValue);
            for (const listener of this.listeners) {
                listener(def.key, def.defaultValue);
            }
        }
        this.saveToStorage();
        console.log('[TuningConfig] All parameters reset to defaults');
    }

    // ── SERIALIZATION (Export / Import) ───────────────────────────────

    /**
     * Export all current values as a plain JSON object.
     * This is the "Copy Config" output — paste-able into source code.
     */
    toJSON(): Record<string, number> {
        const obj: Record<string, number> = {};
        for (const [key, value] of this.values) {
            obj[key] = value;
        }
        return obj;
    }

    /**
     * Import values from a JSON object (e.g., pasted from "Copy Config").
     * Only updates keys that exist in PARAM_DEFS — ignores unknown keys.
     */
    fromJSON(json: Record<string, number>): void {
        for (const def of PARAM_DEFS) {
            if (json[def.key] !== undefined) {
                this.set(def.key, json[def.key]);
            }
        }
        console.log('[TuningConfig] Imported config from JSON');
    }

    // ── LOCALSTORAGE PERSISTENCE ─────────────────────────────────────

    /**
     * Save all current values to localStorage.
     * Called automatically after every set() call.
     */
    private saveToStorage(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.toJSON()));
        } catch {
            // localStorage might be full or disabled — fail silently.
        }
    }

    /**
     * Load saved values from localStorage.
     * Called once during constructor initialization.
     */
    private loadFromStorage(): void {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const json = JSON.parse(stored);
                for (const def of PARAM_DEFS) {
                    if (json[def.key] !== undefined) {
                        this.values.set(
                            def.key,
                            Math.max(def.min, Math.min(def.max, json[def.key]))
                        );
                    }
                }
                console.log('[TuningConfig] Loaded saved config from localStorage');
            }
        } catch {
            // Corrupt data — ignore and use defaults.
            console.warn('[TuningConfig] Failed to load from localStorage, using defaults');
        }
    }
}
