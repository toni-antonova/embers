import * as THREE from 'three';

export class MorphTargets {
    size: number;

    constructor(size: number) {
        this.size = size;
    }

    generateTexture(type: 'ring' | 'sphere'): THREE.DataTexture {
        const count = this.size * this.size;
        const data = new Float32Array(count * 4);

        if (type === 'ring') {
            this.generateRing(data, count);
        } else if (type === 'sphere') {
            this.generateSphere(data, count);
        }

        const texture = new THREE.DataTexture(data, this.size, this.size, THREE.RGBAFormat, THREE.FloatType);
        texture.needsUpdate = true;
        return texture;
    }

    private generateRing(data: Float32Array, count: number) {
        for (let i = 0; i < count; i++) {
            const theta = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.08; // Angular jitter
            const r = 3.0 + (Math.random() - 0.5) * 1.2; // Radial scatter ±0.6
            const x = r * Math.cos(theta);
            const y = r * Math.sin(theta);
            const z = (Math.random() - 0.5) * 0.5; // Depth scatter

            const stride = i * 4;
            data[stride] = x;
            data[stride + 1] = y;
            data[stride + 2] = z;
            data[stride + 3] = 0; // Padding
        }
    }

    private generateSphere(data: Float32Array, count: number) {
        const goldenRatio = (1 + Math.sqrt(5)) / 2;
        for (let i = 0; i < count; i++) {
            const theta = 2 * Math.PI * i / goldenRatio;
            const phi = Math.acos(1 - 2 * (i + 0.5) / count);
            const r = 3.0;

            const x = r * Math.sin(phi) * Math.cos(theta);
            const y = r * Math.sin(phi) * Math.sin(theta);
            const z = r * Math.cos(phi);

            const stride = i * 4;
            data[stride] = x;
            data[stride + 1] = y;
            data[stride + 2] = z;
            data[stride + 3] = 0;
        }
    }
}
