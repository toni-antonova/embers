// ─────────────────────────────────────────────────────────────────────────────
// ServerShapeAdapter — Convert server shapes to GPU-ready DataTextures
// ─────────────────────────────────────────────────────────────────────────────
// The server sends 2,048 sampled points. The particle system has 16,384
// particles (128×128 texture). This adapter expands the 2,048 points into
// 16,384 by assigning each excess particle to a source point with a tiny
// random offset, creating a dense cloud around each attractor.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';
import type { ServerShapeResponse } from '../services/ServerClient';
import type { PartInfo } from '../templates/template-types';

export class ServerShapeAdapter {
    /**
     * Convert server response (2048 points) into a DataTexture
     * compatible with the existing particle system (16,384 particles).
     *
     * Strategy:
     * - First 2,048 pixels: exact server positions
     * - Remaining 14,336 pixels: each maps to serverPoint[i % 2048]
     *   with a small random offset (±0.02 units) to avoid clumping
     *
     * @param response - Decoded server response
     * @param textureSize - Texture dimension (e.g. 128 for 128×128 = 16,384)
     * @param scale - Position multiplier (default 1.5, matching TuningConfig's
     *   `serverShapeScale` default). Server normalizes to [-1,1] which appears
     *   smaller than pre-built shapes. Wired to TuningConfig slider.
     */
    static toDataTexture(
        response: ServerShapeResponse,
        textureSize: number,
        scale: number = 1.5,
    ): THREE.DataTexture {
        const totalPixels = textureSize * textureSize;
        const data = new Float32Array(totalPixels * 4); // RGBA per pixel
        const serverCount = response.positions.length / 3;
        const positions = response.positions;
        const JITTER_RADIUS = 0.005;

        for (let i = 0; i < totalPixels; i++) {
            const srcIdx = i % serverCount;
            const px = i * 4;
            const sx = srcIdx * 3;

            // Copy source position with scale applied
            data[px + 0] = positions[sx + 0] * scale; // X
            data[px + 1] = positions[sx + 1] * scale; // Y
            data[px + 2] = positions[sx + 2] * scale; // Z
            data[px + 3] = 0; // A (unused)

            // Add jitter for expanded particles (beyond the original 2048)
            if (i >= serverCount) {
                data[px + 0] += (Math.random() - 0.5) * 2 * JITTER_RADIUS * scale;
                data[px + 1] += (Math.random() - 0.5) * 2 * JITTER_RADIUS * scale;
                data[px + 2] += (Math.random() - 0.5) * 2 * JITTER_RADIUS * scale;
            }
        }

        const texture = new THREE.DataTexture(
            data,
            textureSize,
            textureSize,
            THREE.RGBAFormat,
            THREE.FloatType,
        );
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * Create a part ID texture — a DataTexture where each pixel's
     * R channel contains the part ID for that particle.
     *
     * @param response - Decoded server response
     * @param textureSize - Texture dimension (e.g. 128)
     */
    static toPartIdTexture(
        response: ServerShapeResponse,
        textureSize: number,
    ): THREE.DataTexture {
        const totalPixels = textureSize * textureSize;
        const data = new Float32Array(totalPixels * 4);
        const serverCount = response.partIds.length;
        const partIds = response.partIds;

        for (let i = 0; i < totalPixels; i++) {
            const srcIdx = i % serverCount;
            const px = i * 4;

            // R = partId as integer-valued float (0–31)
            // The motion-plan shader reads: int partId = int(attr.r + 0.5)
            // so we store the raw integer, NOT normalized to [0, 1]
            data[px + 0] = partIds[srcIdx];
            data[px + 1] = 0;
            data[px + 2] = 0;
            data[px + 3] = 0;
        }

        const texture = new THREE.DataTexture(
            data,
            textureSize,
            textureSize,
            THREE.RGBAFormat,
            THREE.FloatType,
        );
        texture.needsUpdate = true;
        return texture;
    }


    // ── PART LIST + ATTACHMENT WEIGHTS (for motion plan system) ────────

    /**
     * Build a PartInfo[] from the server response.
     *
     * Each unique partId in the response becomes one PartInfo.
     * The shader uses 1-based part IDs (0 = unassigned), so we offset
     * the server's 0-based IDs by +1. parentId is set to null (flat
     * hierarchy — sufficient for glob-based template matching).
     *
     * @param response - Decoded server response with partIds + partNames
     * @returns PartInfo[] ready for template-parser.ts
     */
    static buildPartList(response: ServerShapeResponse): PartInfo[] {
        const seen = new Set<number>();
        const parts: PartInfo[] = [];

        for (let i = 0; i < response.partIds.length; i++) {
            const rawId = response.partIds[i];
            if (seen.has(rawId)) continue;
            seen.add(rawId);

            parts.push({
                id: rawId + 1, // shift to 1-based for shader (0 = unassigned)
                name: rawId < response.partNames.length
                    ? response.partNames[rawId]
                    : `part_${rawId}`,
                parentId: null,
            });
        }

        return parts;
    }

    /**
     * Compute per-particle attachment weights from the server response.
     *
     * For each part, we compute its centroid. Then for every particle
     * we compute the normalized distance from its part's centroid:
     *   weight = dist / maxDist
     *
     * Particles near the center of a part get weight ≈ 0 (joint-like,
     * minimal displacement). Particles at the extremity get weight ≈ 1
     * (full displacement). This creates organic, gradient-based motion
     * rather than rigid per-part blocks.
     *
     * The returned array has `textureSize * textureSize` entries —
     * expanded from the server's 2048 points the same way positions are.
     *
     * @param response - Decoded server response
     * @param textureSize - Particle system texture dimension (e.g. 128)
     * @returns Float32Array of attachment weights (one per particle)
     */
    static computeAttachmentWeights(
        response: ServerShapeResponse,
        textureSize: number,
    ): Float32Array {
        const serverCount = response.partIds.length;
        const positions = response.positions;
        const partIds = response.partIds;

        // Step 1: compute per-part centroid
        const centroidSums: Record<number, [number, number, number, number]> = {};
        for (let i = 0; i < serverCount; i++) {
            const pid = partIds[i];
            if (!centroidSums[pid]) centroidSums[pid] = [0, 0, 0, 0];
            const s = centroidSums[pid];
            s[0] += positions[i * 3 + 0];
            s[1] += positions[i * 3 + 1];
            s[2] += positions[i * 3 + 2];
            s[3] += 1;
        }
        const centroids: Record<number, [number, number, number]> = {};
        for (const [pid, s] of Object.entries(centroidSums)) {
            centroids[Number(pid)] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
        }

        // Step 2: compute per-particle distance from its part centroid
        const serverWeights = new Float32Array(serverCount);
        const maxDistPerPart: Record<number, number> = {};
        for (let i = 0; i < serverCount; i++) {
            const pid = partIds[i];
            const c = centroids[pid];
            const dx = positions[i * 3 + 0] - c[0];
            const dy = positions[i * 3 + 1] - c[1];
            const dz = positions[i * 3 + 2] - c[2];
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            serverWeights[i] = dist;
            maxDistPerPart[pid] = Math.max(maxDistPerPart[pid] ?? 0, dist);
        }

        // Step 3: normalize to [0, 1]
        for (let i = 0; i < serverCount; i++) {
            const maxD = maxDistPerPart[partIds[i]];
            serverWeights[i] = maxD > 0.001 ? serverWeights[i] / maxD : 1.0;
        }

        // Step 4: expand to full particle count (same wrapping as positions)
        const totalPixels = textureSize * textureSize;
        const weights = new Float32Array(totalPixels);
        for (let i = 0; i < totalPixels; i++) {
            weights[i] = serverWeights[i % serverCount];
        }

        return weights;
    }

    /**
     * Build the expanded partIds array (one per particle).
     *
     * Shifts server's 0-based IDs to 1-based (matching buildPartList)
     * and expands from 2048 to textureSize² using modular wrapping.
     *
     * @param response - Decoded server response
     * @param textureSize - Particle system texture dimension
     * @returns Uint8Array of 1-based part IDs (one per particle)
     */
    static expandPartIds(
        response: ServerShapeResponse,
        textureSize: number,
    ): Uint8Array {
        const serverCount = response.partIds.length;
        const totalPixels = textureSize * textureSize;
        const expanded = new Uint8Array(totalPixels);
        for (let i = 0; i < totalPixels; i++) {
            expanded[i] = response.partIds[i % serverCount] + 1; // 1-based
        }
        return expanded;
    }
}
