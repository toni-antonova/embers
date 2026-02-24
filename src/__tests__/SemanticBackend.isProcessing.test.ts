/**
 * SemanticBackend.isProcessing.test.ts — Tests for the isProcessing getter.
 *
 * Verifies that isProcessing correctly reports:
 *   - false when idle (no transition in progress)
 *   - true during Dissolve/Reform/Settle transition phases
 *   - false after transition completes
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemanticBackend, TransitionPhase } from '../services/SemanticBackend';
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
    return {
        setTarget: vi.fn(),
        setTargetTexture: vi.fn(),
        morphTargets: {
            hasTarget: vi.fn().mockReturnValue(false),
        },
        velocityVariable: {
            material: { uniforms: { uDelta: { value: 0.016 } } }
        },
        size: 128,
        currentTarget: 'ring',
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


// ── SETUP ────────────────────────────────────────────────────────────
let mockSpeech: ReturnType<typeof createMockSpeechEngine>;
let classifier: KeywordClassifier;
let mockParticles: ReturnType<typeof createMockParticleSystem>;
let mockBridge: ReturnType<typeof createMockUniformBridge>;
let backend: SemanticBackend;

beforeEach(() => {
    mockSpeech = createMockSpeechEngine();
    classifier = new KeywordClassifier();
    mockParticles = createMockParticleSystem();
    mockBridge = createMockUniformBridge();
    backend = new SemanticBackend(
        mockSpeech,
        classifier,
        mockParticles,
        mockBridge
    );
});


// ══════════════════════════════════════════════════════════════════════
// SUITE: isProcessing
// ══════════════════════════════════════════════════════════════════════

describe('SemanticBackend — isProcessing', () => {
    it('is false when idle (no speech)', () => {
        expect(backend.isProcessing).toBe(false);
    });

    it('is false after processing a hold (no keyword)', () => {
        mockSpeech.pushTranscript('the');
        backend.update(0.016);

        // Hold action doesn't trigger a transition
        expect(backend.isProcessing).toBe(false);
    });

    it('is true during Dissolve phase after morph', () => {
        mockSpeech.pushTranscript('bird');
        backend.update(0.016);

        // Should be in Dissolve phase
        expect(backend.currentTransitionPhase).toBe(TransitionPhase.Dissolve);
        expect(backend.isProcessing).toBe(true);
    });

    it('is true during Reform phase', () => {
        mockSpeech.pushTranscript('bird');
        backend.update(0.016);

        // Run past Dissolve (0.3s worth of frames)
        for (let i = 0; i < 22; i++) backend.update(0.016);

        expect(backend.currentTransitionPhase).toBe(TransitionPhase.Reform);
        expect(backend.isProcessing).toBe(true);
    });

    it('is true during Settle phase', () => {
        mockSpeech.pushTranscript('bird');
        backend.update(0.016);

        // Run past Dissolve + Reform (~1.0s total at default timing)
        for (let i = 0; i < 70; i++) backend.update(0.016);

        expect(backend.currentTransitionPhase).toBe(TransitionPhase.Settle);
        expect(backend.isProcessing).toBe(true);
    });

    it('returns to false after full transition completes', () => {
        mockSpeech.pushTranscript('bird');
        backend.update(0.016);

        // Run enough frames for all phases: Dissolve(0.3s) + Reform(0.7s) + Settle(0.5s) = ~1.5s
        for (let i = 0; i < 120; i++) backend.update(0.016);

        expect(backend.currentTransitionPhase).toBe(TransitionPhase.Idle);
        expect(backend.isProcessing).toBe(false);
    });
});
