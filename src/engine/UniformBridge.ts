import { AudioEngine } from '../services/AudioEngine';
import { ParticleSystem } from './ParticleSystem';
import { TuningConfig } from '../services/TuningConfig';
import * as THREE from 'three';

/**
 * UniformBridge — Connects audio analysis to particle visuals.
 *
 * This class is the "translator" between the AudioEngine (which produces
 * abstract feature values like energy, tension, etc.) and the ParticleSystem
 * (which needs specific shader uniform values to control particle behavior).
 *
 * The bridge runs every frame in the animation loop. It:
 * 1. Reads the latest audio features from AudioEngine
 * 2. Applies influence multipliers from TuningConfig (so each feature
 *    can be boosted, attenuated, or muted from the tuning panel)
 * 3. Clamps all values to safe [0, 1] ranges (defensive programming)
 * 4. Writes them into the velocity shader uniforms
 * 5. Derives visual properties like color from the features
 */
export type ColorMode = 'white' | 'rainbow';

export class UniformBridge {
    audioEngine: AudioEngine;
    particleSystem: ParticleSystem;

    // TuningConfig reference — used to read influence multipliers.
    // These multipliers let the tuning panel control how much each
    // audio feature affects the particle visuals.
    private config: TuningConfig;

    // Color mode — controls whether particles are white (with subtle tension
    // tint) or cycling through rainbow hues. Set from TuningPanel via Canvas.
    colorMode: ColorMode = 'white';

    // Idle mode — when true, all audio features are zeroed and
    // particles return to a calm baseline state (shape, speed 1, white).
    idleMode = false;

    // ── DIAGNOSTIC LOGGING (TEMPORARY) ────────────────────────────
    // Logs the actual uniform values being sent to the shader every ~0.5s.
    // This is the final checkpoint: if [SMOOTH] shows nonzero but
    // [UNIFORMS] shows zero, the bug is in UniformBridge.
    private logCounter = 0;
    private logInterval = 30; // ~0.5s at 60fps

    constructor(audioEngine: AudioEngine, particleSystem: ParticleSystem, config: TuningConfig) {
        this.audioEngine = audioEngine;
        this.particleSystem = particleSystem;
        this.config = config;
    }

    /**
     * Smoothly reset all audio-driven effects to idle baseline.
     * Called by the UI "return to idle" button.
     */
    resetToIdle() {
        this.idleMode = true;
    }

    /**
     * Exit idle mode (e.g. when mic is turned on again).
     */
    exitIdle() {
        this.idleMode = false;
    }

    update() {
        const features = this.audioEngine.getFeatures();

        // Get references to the shader uniforms we need to update
        const uniforms = this.particleSystem.velocityVariable.material.uniforms;
        const renderUniforms = (this.particleSystem.particles.material as THREE.ShaderMaterial).uniforms;

        // ── APPLY INFLUENCE MULTIPLIERS FROM TUNING CONFIG ────────────
        // Each audio feature has an "influence" slider in the tuning panel.
        // influence=0 → feature is muted (no visual effect)
        // influence=1 → default strength
        // influence=2 → doubled effect
        // This lets you isolate individual features to see their effect,
        // or boost features that aren't prominent enough.
        let energy = features.energy * this.config.get('audioInfluence.energy');
        let tension = features.tension * this.config.get('audioInfluence.tension');
        let urgency = features.urgency * this.config.get('audioInfluence.urgency');
        let breathiness = features.breathiness * this.config.get('audioInfluence.breathiness');
        let textureComplexity = features.textureComplexity * this.config.get('audioInfluence.textureComplexity');
        let rolloff = features.rolloff * this.config.get('audioInfluence.rolloff');

        // ── IDLE MODE ─────────────────────────────────────────────────
        // When idle, zero out all audio features so particles return to
        // neutral state. The shader's spring force handles smooth return.
        if (this.idleMode) {
            energy = 0;
            tension = 0;
            urgency = 0;
            breathiness = 0;
            textureComplexity = 0;
            rolloff = 0.5; // Neutral edge softness
        }

        // ── MAP AUDIO FEATURES → SHADER UNIFORMS ──────────────────────
        // All values are clamped to [0, 1] as a safety measure.
        // Even though AudioEngine normalizes values, edge cases in audio
        // processing (e.g., sudden loud sounds, mic gain changes) could
        // produce values > 1.0 or NaN. Clamping prevents shader instability.
        uniforms.uEnergy.value = Math.max(0, Math.min(1, energy));
        uniforms.uTension.value = Math.max(0, Math.min(1, tension));
        uniforms.uUrgency.value = Math.max(0, Math.min(1, urgency));
        uniforms.uBreathiness.value = Math.max(0, Math.min(1, breathiness));
        uniforms.uTextureComplexity.value = Math.max(0, Math.min(1, textureComplexity));

        // ── CURVE SHAPING MODES → SHADER UNIFORMS ─────────────────────
        // Push the toggle states and threshold values from TuningConfig
        // to the velocity shader every frame. These control how energy
        // and urgency map to visual effects (linear vs shaped curves).
        uniforms.uEnergyCurveMode.value = this.config.get('energyCurveMode');
        uniforms.uUrgencyCurveMode.value = this.config.get('urgencyCurveMode');
        uniforms.uUrgencyThresholdLow.value = this.config.get('urgencyThresholdLow');
        uniforms.uUrgencyThresholdHigh.value = this.config.get('urgencyThresholdHigh');

        // ── ROLLOFF → RENDER SHADER ───────────────────────────────────
        // Spectral rolloff controls particle edge softness/crispness.
        renderUniforms.uRolloff.value = Math.max(0, Math.min(1, rolloff));

        // ── DIAGNOSTIC LOGGING (TEMPORARY) ────────────────────────────
        // Tier 3: The actual values on the shader uniforms.
        // If [SMOOTH] values are nonzero but these are zero, the bug
        // is in the clamping or property access above.
        this.logCounter++;
        if (this.logCounter >= this.logInterval) {
            this.logCounter = 0;
            console.log(
                `[UNIFORMS] uEnergy:${uniforms.uEnergy.value.toFixed(3)} ` +
                `uTension:${uniforms.uTension.value.toFixed(3)} ` +
                `uUrgency:${uniforms.uUrgency.value.toFixed(3)} ` +
                `uBreathiness:${uniforms.uBreathiness.value.toFixed(3)} ` +
                `uTexture:${uniforms.uTextureComplexity.value.toFixed(3)} ` +
                `uRolloff:${renderUniforms.uRolloff.value.toFixed(3)}`
            );
        }

        // ── COLOR MODE → SHADER UNIFORM ──────────────────────────────
        // Push the color mode to the render shader. The shader uses this
        // to decide between white (tension-tinted) and rainbow rendering.
        renderUniforms.uColorMode.value = this.colorMode === 'rainbow' ? 1.0 : 0.0;

        // ── DERIVED VISUALS ───────────────────────────────────────────
        // In WHITE mode: Tension → Color Shift — calm speech is warm
        // (off-white), tense/high-pitched speech shifts to cool (blue-white).
        // In RAINBOW mode: the shader handles color entirely via HSL,
        // so we just set a neutral white baseline.
        if (this.colorMode === 'white') {
            const coolColor = new THREE.Color(0.85, 0.9, 1.0);   // Blue-white
            const warmColor = new THREE.Color(1.0, 0.92, 0.8);   // Warm off-white
            const color = new THREE.Color().lerpColors(warmColor, coolColor, features.tension);
            renderUniforms.uColor.value.copy(color);
        } else {
            // Rainbow mode — the fragment shader handles all coloring via HSL.
            // Set neutral white so the glow modulation (core*0.5+0.5) stays clean.
            renderUniforms.uColor.value.set(1.0, 1.0, 1.0);
        }
    }
}
