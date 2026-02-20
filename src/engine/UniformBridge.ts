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
export class UniformBridge {
    audioEngine: AudioEngine;
    particleSystem: ParticleSystem;

    // TuningConfig reference — used to read influence multipliers.
    // These multipliers let the tuning panel control how much each
    // audio feature affects the particle visuals.
    private config: TuningConfig;

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
        const energy = features.energy * this.config.get('audioInfluence.energy');
        const tension = features.tension * this.config.get('audioInfluence.tension');
        const urgency = features.urgency * this.config.get('audioInfluence.urgency');
        const breathiness = features.breathiness * this.config.get('audioInfluence.breathiness');

        // ── MAP AUDIO FEATURES → SHADER UNIFORMS ──────────────────────
        // All values are clamped to [0, 1] as a safety measure.
        // Even though AudioEngine normalizes values, edge cases in audio
        // processing (e.g., sudden loud sounds, mic gain changes) could
        // produce values > 1.0 or NaN. Clamping prevents shader instability.
        uniforms.uEnergy.value = Math.max(0, Math.min(1, energy));
        uniforms.uTension.value = Math.max(0, Math.min(1, tension));
        uniforms.uUrgency.value = Math.max(0, Math.min(1, urgency));
        uniforms.uBreathiness.value = Math.max(0, Math.min(1, breathiness));

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
                `uBreathiness:${uniforms.uBreathiness.value.toFixed(3)}`
            );
        }

        // ── DERIVED VISUALS ───────────────────────────────────────────
        // Tension → Color Shift: calm speech is warm (off-white),
        // tense/high-pitched speech shifts to cool (blue-white).
        // This creates a subtle emotional temperature indicator.
        const coolColor = new THREE.Color(0.85, 0.9, 1.0);   // Blue-white
        const warmColor = new THREE.Color(1.0, 0.92, 0.8);   // Warm off-white
        const color = new THREE.Color().lerpColors(warmColor, coolColor, features.tension);
        renderUniforms.uColor.value.copy(color);
    }
}
