import * as THREE from 'three';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import positionFrag from '../shaders/position.frag.glsl?raw';
import velocityFrag from '../shaders/velocity.frag.glsl?raw';
import renderVert from '../shaders/render.vert.glsl?raw';
import renderFrag from '../shaders/render.frag.glsl?raw';
import { MorphTargets } from './MorphTargets';

export class ParticleSystem {
    renderer: THREE.WebGLRenderer;
    gpuCompute: GPUComputationRenderer;
    positionVariable: any;
    velocityVariable: any;
    particles: THREE.Points;
    size: number;
    time: number;
    morphTargets: MorphTargets;

    constructor(renderer: THREE.WebGLRenderer, size: number = 128) {
        this.renderer = renderer;
        this.size = size;
        this.time = 0;
        this.morphTargets = new MorphTargets(size);

        // Initialize GPUComputationRenderer
        this.gpuCompute = new GPUComputationRenderer(size, size, renderer);

        // Create initial textures
        const dtPosition = this.gpuCompute.createTexture();
        const dtVelocity = this.gpuCompute.createTexture();
        this.initTextures(dtPosition, dtVelocity);

        // Add variables
        this.velocityVariable = this.gpuCompute.addVariable('textureVelocity', velocityFrag, dtVelocity);
        this.positionVariable = this.gpuCompute.addVariable('texturePosition', positionFrag, dtPosition);

        // Dependencies
        this.gpuCompute.setVariableDependencies(this.velocityVariable, [this.positionVariable, this.velocityVariable]);
        this.gpuCompute.setVariableDependencies(this.positionVariable, [this.positionVariable, this.velocityVariable]);

        // Generate initial morph target (ring)
        const tMorphTarget = this.morphTargets.generateTexture('ring');

        // Uniforms
        this.velocityVariable.material.uniforms.uTime = { value: 0.0 };
        this.velocityVariable.material.uniforms.uNoiseAmplitude = { value: 0.15 };
        this.velocityVariable.material.uniforms.uNoiseFrequency = { value: 0.8 };
        this.velocityVariable.material.uniforms.uDrag = { value: 2.5 };
        this.velocityVariable.material.uniforms.tMorphTarget = { value: tMorphTarget };
        this.velocityVariable.material.uniforms.uSpringK = { value: 3.0 };
        this.velocityVariable.material.uniforms.uAbstraction = { value: 0.0 };

        // Feature Uniforms
        this.velocityVariable.material.uniforms.uEnergy = { value: 0.0 };
        this.velocityVariable.material.uniforms.uTension = { value: 0.0 };
        this.velocityVariable.material.uniforms.uUrgency = { value: 0.0 };
        this.velocityVariable.material.uniforms.uBreathiness = { value: 0.0 };

        // New Uniforms for Breathing & Interaction
        this.velocityVariable.material.uniforms.uBreathingAmplitude = { value: 0.03 };
        this.velocityVariable.material.uniforms.uPointerPos = { value: new THREE.Vector3(9999, 9999, 9999) };
        this.velocityVariable.material.uniforms.uPointerActive = { value: 0.0 };

        this.velocityVariable.material.uniforms.uDelta = { value: 0.016 };
        this.positionVariable.material.uniforms.uDelta = { value: 0.016 };

        // Initialize
        const error = this.gpuCompute.init();
        if (error !== null) {
            console.error('GPUComputationRenderer init error:', error);
            throw new Error(`GPUComputationRenderer failed to init: ${error}`);
        }
        console.log('[ParticleSystem] GPUComputationRenderer initialized OK, size:', size, '×', size, '=', size * size, 'particles');

        // Create Render Geometry
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(size * size * 3);
        const uvs = new Float32Array(size * size * 2);

        let p = 0;
        for (let j = 0; j < size; j++) {
            for (let i = 0; i < size; i++) {
                uvs[p * 2] = i / (size - 1);
                uvs[p * 2 + 1] = j / (size - 1);
                positions[p * 3] = 0;
                positions[p * 3 + 1] = 0;
                positions[p * 3 + 2] = 0;
                p++;
            }
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

        // Render Material
        const material = new THREE.ShaderMaterial({
            uniforms: {
                texturePosition: { value: null },
                textureVelocity: { value: null },
                uColor: { value: new THREE.Color(1.0, 1.0, 1.0) },
                uAlpha: { value: 0.9 },
                uPointSize: { value: 6.0 }
            },
            vertexShader: renderVert,
            fragmentShader: renderFrag,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.particles = new THREE.Points(geometry, material);
        this.particles.matrixAutoUpdate = false;
        this.particles.updateMatrix();
    }

    initTextures(texturePosition: THREE.DataTexture, textureVelocity: THREE.DataTexture) {
        const posArray = texturePosition.image.data;
        const velArray = textureVelocity.image.data;

        if (!posArray || !velArray) return;

        for (let k = 0, kl = posArray.length; k < kl; k += 4) {
            // Position: ring formation
            const theta = Math.random() * Math.PI * 2;
            const r = 2.5 + Math.random() * 0.5;
            const x = r * Math.cos(theta);
            const y = r * Math.sin(theta);
            const z = (Math.random() - 0.5) * 0.2;

            posArray[k + 0] = x;
            posArray[k + 1] = y;
            posArray[k + 2] = z;
            posArray[k + 3] = Math.random();

            // Velocity: zero initial
            velArray[k + 0] = 0;
            velArray[k + 1] = 0;
            velArray[k + 2] = 0;
            velArray[k + 3] = 0;
        }
    }

    update(deltaTime: number) {
        this.time += deltaTime;

        // Update Uniforms
        this.velocityVariable.material.uniforms.uTime.value = this.time;
        this.positionVariable.material.uniforms.uDelta.value = deltaTime;
        this.velocityVariable.material.uniforms.uDelta.value = deltaTime;

        // Update GPGPU
        this.gpuCompute.compute();

        // Update Render Uniforms
        (this.particles.material as THREE.ShaderMaterial).uniforms.texturePosition.value =
            this.gpuCompute.getCurrentRenderTarget(this.positionVariable).texture;
        (this.particles.material as THREE.ShaderMaterial).uniforms.textureVelocity.value =
            this.gpuCompute.getCurrentRenderTarget(this.velocityVariable).texture;
    }

    setPointer(position: THREE.Vector3, active: boolean) {
        this.velocityVariable.material.uniforms.uPointerPos.value.copy(position);
        this.velocityVariable.material.uniforms.uPointerActive.value = active ? 1.0 : 0.0;
    }

    resize() {
        // No-op for now
    }

    dispose() {
        // Dispose GPUComputationRenderer's internal render targets.
        // GPUComputationRenderer uses the main renderer's GL context,
        // but still creates render target textures we must free.
        if (this.gpuCompute && (this.gpuCompute as any).variables) {
            const vars = (this.gpuCompute as any).variables;
            for (const v of vars) {
                if (v.renderTargets) {
                    for (const rt of v.renderTargets) {
                        rt.dispose();
                    }
                }
            }
        }

        if (this.particles) {
            this.particles.geometry.dispose();
            if (Array.isArray(this.particles.material)) {
                this.particles.material.forEach(m => m.dispose());
            } else {
                this.particles.material.dispose();
            }
        }
    }
}
