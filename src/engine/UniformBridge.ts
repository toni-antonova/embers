import { AudioEngine } from '../services/AudioEngine';
import { ParticleSystem } from './ParticleSystem';
import * as THREE from 'three';

export class UniformBridge {
    audioEngine: AudioEngine;
    particleSystem: ParticleSystem;

    constructor(audioEngine: AudioEngine, particleSystem: ParticleSystem) {
        this.audioEngine = audioEngine;
        this.particleSystem = particleSystem;
    }

    update() {
        const features = this.audioEngine.getFeatures();
        const uniforms = this.particleSystem.velocityVariable.material.uniforms;
        const renderUniforms = (this.particleSystem.particles.material as THREE.ShaderMaterial).uniforms;

        // Map features to uniforms
        uniforms.uEnergy.value = features.energy;
        uniforms.uTension.value = features.tension;
        uniforms.uUrgency.value = features.urgency;
        uniforms.uBreathiness.value = features.breathiness;

        // Derived Visuals
        // Tension -> Color Shift (Cool vs Warm)
        const coolColor = new THREE.Color(0.85, 0.9, 1.0);
        const warmColor = new THREE.Color(1.0, 0.92, 0.8);
        const color = new THREE.Color().lerpColors(warmColor, coolColor, features.tension);
        renderUniforms.uColor.value.copy(color);
    }
}
