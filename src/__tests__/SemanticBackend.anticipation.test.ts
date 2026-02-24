/**
 * SemanticBackend.anticipation.test.ts — Tests for Anticipation Drift.
 *
 * WHAT WE'RE TESTING:
 * ───────────────────
 * When a server shape request is in flight, particles gently swirl
 * toward the morph target using a very weak, slowly ramping spring
 * and gentle curl noise. This gives visual feedback during the wait.
 *
 * 1. Anticipation activates in complex mode after server request
 * 2. Spring starts very low and ramps slowly (cubic ease-in)
 * 3. Noise stays present during anticipation
 * 4. Anticipation clears when server shape arrives
 * 5. Anticipation clears on server failure
 * 6. Anticipation doesn't activate without a server client
 * 7. dispose() clears anticipation state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemanticBackend } from '../services/SemanticBackend';
import { KeywordClassifier } from '../services/KeywordClassifier';
import type { TranscriptEvent } from '../services/SpeechEngine';

// ── MOCK FACTORIES ───────────────────────────────────────────────────

function createMockSpeechEngine() {
    let capturedCallback: ((event: TranscriptEvent) => void) | null = null;
    return {
        onTranscript: vi.fn((cb: (event: TranscriptEvent) => void) => {
            capturedCallback = cb;
            return () => { capturedCallback = null; };
        }),
        pushTranscript(text: string, isFinal = true) {
            if (capturedCallback) {
                capturedCallback({ text, isFinal, timestamp: Date.now() });
            }
        },
    } as any;
}

function createMockParticleSystem() {
    const uniforms: Record<string, { value: unknown }> = {
        uDelta: { value: 0.016 },
    };
    return {
        setTarget: vi.fn(),
        setTargetTexture: vi.fn(),
        morphTargets: {
            hasTarget: vi.fn().mockReturnValue(false),
        },
        velocityVariable: {
            material: { uniforms }
        },
        size: 128,
        time: 0,
        currentTarget: 'ring',
        getVelocityUniforms: vi.fn().mockReturnValue(uniforms),
    } as any;
}

function createMockUniformBridge() {
    return {
        sentimentOverride: null as number | null,
        abstractionOverride: null as number | null,
        noiseOverride: null as number | null,
        emotionalIntensityOverride: null as number | null,
        springOverride: null as number | null,
        transitionPhase: 0,
    } as any;
}

function createMockTuningConfig(complexMode: boolean) {
    return {
        _complexMode: complexMode,
        get complexMode() { return this._complexMode; },
        set complexMode(v: boolean) { this._complexMode = v; },
        get: vi.fn().mockReturnValue(1.5),
        set: vi.fn(),
    } as any;
}

// Controllable mock — resolve/reject the promise from tests
function createControllableServerClient() {
    let resolveShape: ((v: any) => void) | null = null;

    return {
        client: {
            generateShape: vi.fn().mockImplementation(() => {
                return new Promise((resolve) => {
                    resolveShape = resolve;
                });
            }),
            warmUp: vi.fn().mockResolvedValue(true),
        } as any,
        resolveWith(response: any) {
            resolveShape?.(response);
        },
        resolveWithFailure() {
            resolveShape?.(null);
        },
    };
}

function makeServerResponse() {
    return {
        positions: new Float32Array(2048 * 3),
        partIds: new Uint8Array(2048),
        partNames: ['body'],
        templateType: 'custom',
        boundingBox: { min: [-1, -1, -1], max: [1, 1, 1] },
        cached: false,
        generationTimeMs: 500,
        pipeline: 'partcrafter',
    };
}


// ── SETUP ────────────────────────────────────────────────────────────
let mockSpeech: ReturnType<typeof createMockSpeechEngine>;
let classifier: KeywordClassifier;
let mockParticles: ReturnType<typeof createMockParticleSystem>;
let mockBridge: ReturnType<typeof createMockUniformBridge>;

beforeEach(() => {
    mockSpeech = createMockSpeechEngine();
    classifier = new KeywordClassifier();
    mockParticles = createMockParticleSystem();
    mockBridge = createMockUniformBridge();
});


// ══════════════════════════════════════════════════════════════════════
// SUITE: Anticipation Drift
// ══════════════════════════════════════════════════════════════════════

describe('SemanticBackend — Anticipation Drift', () => {

    it('activates anticipation in complex mode after server request', () => {
        const mockConfig = createMockTuningConfig(true);
        const { client } = createControllableServerClient();

        const backend = new SemanticBackend(
            mockSpeech, classifier, mockParticles, mockBridge,
            null, client, null, mockConfig,
        );

        mockSpeech.pushTranscript('a dragon blows fire', true);
        backend.update(0.016);

        // Should have very low spring (anticipation start ~0.15)
        expect(mockBridge.springOverride).toBeCloseTo(0.3, 1);
        // Should have gentle noise
        expect(mockBridge.noiseOverride).toBeCloseTo(1.0, 1);
    });

    it('spring ramps slowly with cubic ease-in over time', () => {
        const mockConfig = createMockTuningConfig(true);
        const { client } = createControllableServerClient();

        const backend = new SemanticBackend(
            mockSpeech, classifier, mockParticles, mockBridge,
            null, client, null, mockConfig,
        );

        mockSpeech.pushTranscript('a fierce lion', true);
        backend.update(0.016);

        const initialSpring = mockBridge.springOverride;

        // Advance 5 seconds (300 frames at 16ms)
        for (let i = 0; i < 300; i++) backend.update(0.016);

        const springAfter5s = mockBridge.springOverride;

        // Spring should have increased but still be well below normal (1.5)
        expect(springAfter5s).toBeGreaterThan(initialSpring!);
        expect(springAfter5s).toBeLessThan(1.0);

        // Noise should still be present
        expect(mockBridge.noiseOverride).toBeGreaterThan(0.1);
    });

    it('clears anticipation when server shape arrives', async () => {
        const mockConfig = createMockTuningConfig(true);
        const { client, resolveWith } = createControllableServerClient();

        const backend = new SemanticBackend(
            mockSpeech, classifier, mockParticles, mockBridge,
            null, client, null, mockConfig,
        );

        mockSpeech.pushTranscript('a beautiful mountain', true);
        backend.update(0.016);

        // Anticipation should be active
        expect(mockBridge.springOverride).toBeCloseTo(0.3, 1);

        // Server responds
        resolveWith(makeServerResponse());

        // Wait for promise resolution
        await vi.waitFor(() => {
            expect(mockBridge.springOverride).toBeNull();
        });

        expect(mockBridge.noiseOverride).toBeNull();
    });

    it('clears anticipation when server fails', async () => {
        const mockConfig = createMockTuningConfig(true);
        const { client, resolveWithFailure } = createControllableServerClient();

        const backend = new SemanticBackend(
            mockSpeech, classifier, mockParticles, mockBridge,
            null, client, null, mockConfig,
        );

        mockSpeech.pushTranscript('a glowing crystal', true);
        backend.update(0.016);

        expect(mockBridge.springOverride).toBeCloseTo(0.3, 1);

        // Server fails
        resolveWithFailure();

        await vi.waitFor(() => {
            expect(mockBridge.springOverride).toBeNull();
        });

        expect(mockBridge.noiseOverride).toBeNull();
    });

    it('does NOT activate anticipation without a server client', () => {
        const mockConfig = createMockTuningConfig(true);

        // No server client
        const backend = new SemanticBackend(
            mockSpeech, classifier, mockParticles, mockBridge,
            null, null, null, mockConfig,
        );

        mockSpeech.pushTranscript('a dragon blows fire', true);
        backend.update(0.016);

        // Without server, anticipation should not activate
        // Bridge overrides should reflect whatever simple-mode or fallback does,
        // but NOT the anticipation start value (0.15)
        expect(mockBridge.springOverride).not.toBeCloseTo(0.3, 1);
    });

    it('dispose() clears anticipation state', () => {
        const mockConfig = createMockTuningConfig(true);
        const { client } = createControllableServerClient();

        const backend = new SemanticBackend(
            mockSpeech, classifier, mockParticles, mockBridge,
            null, client, null, mockConfig,
        );

        mockSpeech.pushTranscript('a fierce lion', true);
        backend.update(0.016);

        // Anticipation is active
        expect(mockBridge.springOverride).toBeCloseTo(0.3, 1);

        // Dispose
        backend.dispose();

        // All overrides cleared
        expect(mockBridge.springOverride).toBeNull();
        expect(mockBridge.noiseOverride).toBeNull();
    });
});
