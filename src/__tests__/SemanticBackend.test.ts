/**
 * SemanticBackend.test.ts — Unit tests for the Speech → Classification → Morph pipeline.
 *
 * WHAT WE'RE TESTING:
 * ───────────────────
 * SemanticBackend is the orchestrator that:
 *   1. Queues transcript events from SpeechEngine (async → synchronous drain)
 *   2. Classifies text via KeywordClassifier
 *   3. Triggers morph target changes on ParticleSystem
 *   4. Manages abstraction lerp (temporal crystallization)
 *   5. Applies "loosening" noise bump after silence breaks
 *   6. Resets to ring after 5 minutes of continuous silence
 *   7. Pushes sentiment to UniformBridge for color/movement
 *
 * MOCK STRATEGY:
 * ──────────────
 * - SpeechEngine: stub onTranscript to capture the callback
 * - KeywordClassifier: REAL instance (deterministic dictionary lookup)
 * - ParticleSystem: spy on setTarget()
 * - UniformBridge: stub properties (sentimentOverride, abstractionOverride, noiseOverride)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemanticBackend } from '../services/SemanticBackend';
import { KeywordClassifier } from '../services/KeywordClassifier';
import type { TranscriptEvent } from '../services/SpeechEngine';

// ── MOCK FACTORIES ───────────────────────────────────────────────────

/** Capture the transcript callback so we can push events manually. */
function createMockSpeechEngine() {
    let capturedCallback: ((event: TranscriptEvent) => void) | null = null;

    return {
        onTranscript: vi.fn((cb: (event: TranscriptEvent) => void) => {
            capturedCallback = cb;
            return () => { capturedCallback = null; };
        }),
        /** Push a transcript event as if speech was recognized. */
        pushTranscript(text: string, isFinal = true) {
            if (capturedCallback) {
                capturedCallback({
                    text,
                    isFinal,
                    timestamp: Date.now(),
                });
            }
        },
        /** Check if unsubscribed. */
        get isSubscribed() { return capturedCallback !== null; },
    } as any;
}

/** Mock ParticleSystem with a setTarget spy. */
function createMockParticleSystem() {
    return {
        setTarget: vi.fn(),
        velocityVariable: {
            material: { uniforms: { uDelta: { value: 0.016 } } }
        },
    } as any;
}

/** Mock UniformBridge with observable properties. */
function createMockUniformBridge() {
    return {
        sentimentOverride: null as number | null,
        abstractionOverride: null as number | null,
        noiseOverride: null as number | null,
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
// SUITE 1: TRANSCRIPT QUEUE DRAINING
// ══════════════════════════════════════════════════════════════════════

describe('SemanticBackend — Queue Draining', () => {
    it('transcripts are queued in callback and processed in update()', () => {
        // Push a transcript — should NOT immediately call setTarget
        mockSpeech.pushTranscript('horse');
        expect(mockParticles.setTarget).not.toHaveBeenCalled();

        // Now call update — should process the queued transcript
        backend.update(0.016);
        expect(mockParticles.setTarget).toHaveBeenCalledWith('quadruped');
    });

    it('multiple transcripts in one frame are all processed', () => {
        mockSpeech.pushTranscript('horse');
        mockSpeech.pushTranscript('ocean');

        backend.update(0.016);

        // Both should have been processed; final target should be wave (ocean)
        expect(mockParticles.setTarget).toHaveBeenCalledWith('quadruped');
        expect(mockParticles.setTarget).toHaveBeenCalledWith('wave');
    });
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 2: MORPH TARGET SWITCHING
// ══════════════════════════════════════════════════════════════════════

describe('SemanticBackend — Morph Actions', () => {
    it('high-confidence keyword triggers morph', () => {
        mockSpeech.pushTranscript('bird');
        backend.update(0.016);

        expect(mockParticles.setTarget).toHaveBeenCalledWith('bird');
        expect(backend.lastAction).toBe('morph');
        expect(backend.lastState?.morphTarget).toBe('bird');
    });

    it('no keyword results in hold action (abstraction drifts up)', () => {
        mockSpeech.pushTranscript('the');
        backend.update(0.016);

        expect(mockParticles.setTarget).not.toHaveBeenCalled();
        expect(backend.lastAction).toBe('hold');
    });

    it('same target is not re-applied for interim results', () => {
        // First morph to quadruped
        mockSpeech.pushTranscript('horse', true);
        backend.update(0.016);
        expect(mockParticles.setTarget).toHaveBeenCalledTimes(1);

        // Same keyword as interim — should be skipped (same target)
        mockSpeech.pushTranscript('horse', false);
        backend.update(0.016);
        expect(mockParticles.setTarget).toHaveBeenCalledTimes(1);
    });
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 3: LOOSENING BEHAVIOR
// ══════════════════════════════════════════════════════════════════════

describe('SemanticBackend — Loosening', () => {
    it('triggers loosening when speech arrives after >2s silence', () => {
        // Simulate 3 seconds of silence
        backend.update(3.0);

        // Now speech arrives
        mockSpeech.pushTranscript('hello');
        backend.update(0.016);

        // noiseOverride should be set (loosening active)
        expect(mockBridge.noiseOverride).toBe(0.3);
    });

    it('does NOT trigger loosening for rapid speech (<2s gap)', () => {
        // Simulate 0.5 seconds (less than silence gate)
        backend.update(0.5);

        mockSpeech.pushTranscript('hello');
        backend.update(0.016);

        // noiseOverride should stay null (no loosening)
        expect(mockBridge.noiseOverride).toBeNull();
    });

    it('loosening expires after 0.3s', () => {
        // Trigger loosening
        backend.update(3.0);
        mockSpeech.pushTranscript('hello');
        backend.update(0.016);
        expect(mockBridge.noiseOverride).toBe(0.3);

        // Run enough frames for loosening to expire (0.3s)
        backend.update(0.35);
        expect(mockBridge.noiseOverride).toBeNull();
    });
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 4: 5-MINUTE SILENCE RESET
// ══════════════════════════════════════════════════════════════════════

describe('SemanticBackend — Silence Reset', () => {
    it('resets to ring after 5 minutes of continuous silence', () => {
        // First morph to something
        mockSpeech.pushTranscript('bird');
        backend.update(0.016);
        expect(mockParticles.setTarget).toHaveBeenCalledWith('bird');
        mockParticles.setTarget.mockClear();

        // Simulate 301 seconds of silence (> 300 threshold)
        backend.update(301);

        expect(mockParticles.setTarget).toHaveBeenCalledWith('ring');
    });

    it('does NOT reset if silence is less than 5 minutes', () => {
        mockSpeech.pushTranscript('bird');
        backend.update(0.016);
        mockParticles.setTarget.mockClear();

        // Simulate 200 seconds (less than threshold)
        backend.update(200);

        expect(mockParticles.setTarget).not.toHaveBeenCalled();
    });
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 5: ABSTRACTION LERP
// ══════════════════════════════════════════════════════════════════════

describe('SemanticBackend — Abstraction', () => {
    it('abstraction converges toward target over multiple frames', () => {
        // Morph to a concrete noun (low abstraction ~0.2)
        mockSpeech.pushTranscript('horse');
        backend.update(0.016);

        const afterMorph = backend.abstraction;

        // Run many frames — abstraction should approach the target
        for (let i = 0; i < 100; i++) backend.update(0.016);

        const afterConverge = backend.abstraction;
        // Should have moved toward the concrete noun's abstraction level
        expect(afterConverge).not.toEqual(afterMorph);
    });

    it('pushes abstraction to uniformBridge.abstractionOverride', () => {
        backend.update(0.016);
        expect(mockBridge.abstractionOverride).toEqual(backend.abstraction);
    });
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 6: SENTIMENT OVERRIDE
// ══════════════════════════════════════════════════════════════════════

describe('SemanticBackend — Sentiment', () => {
    it('pushes classified sentiment to uniformBridge', () => {
        mockSpeech.pushTranscript('happy');
        backend.update(0.016);

        // "happy" has a positive AFINN score
        expect(mockBridge.sentimentOverride).toBeGreaterThan(0);
    });

    it('pushes negative sentiment for negative words', () => {
        mockSpeech.pushTranscript('terrible');
        backend.update(0.016);

        expect(mockBridge.sentimentOverride).toBeLessThan(0);
    });

    it('sentiment is pushed even on hold (no keyword match)', () => {
        mockSpeech.pushTranscript('happy beautiful');
        backend.update(0.016);

        // Should still push sentiment even without a shape keyword
        expect(mockBridge.sentimentOverride).not.toBeNull();
    });
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 7: EVENT LOG
// ══════════════════════════════════════════════════════════════════════

describe('SemanticBackend — Event Log', () => {
    it('getEventLog() starts empty', () => {
        expect(backend.getEventLog()).toHaveLength(0);
    });

    it('morph actions are logged', () => {
        mockSpeech.pushTranscript('horse');
        backend.update(0.016);

        const log = backend.getEventLog();
        expect(log.length).toBeGreaterThanOrEqual(1);

        const morphEvent = log.find(e => e.action === 'morph');
        expect(morphEvent).toBeDefined();
        expect(morphEvent!.classification.morphTarget).toBe('quadruped');
    });

    it('hold actions on final transcripts are logged', () => {
        mockSpeech.pushTranscript('the', true);
        backend.update(0.016);

        const log = backend.getEventLog();
        const holdEvent = log.find(e => e.action === 'hold');
        expect(holdEvent).toBeDefined();
    });
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 8: DISPOSE
// ══════════════════════════════════════════════════════════════════════

describe('SemanticBackend — Dispose', () => {
    it('clears all overrides on dispose', () => {
        // Set some overrides via normal operation
        mockSpeech.pushTranscript('happy horse');
        backend.update(0.016);

        backend.dispose();

        expect(mockBridge.sentimentOverride).toBeNull();
        expect(mockBridge.abstractionOverride).toBeNull();
        expect(mockBridge.noiseOverride).toBeNull();
    });

    it('unsubscribes from SpeechEngine on dispose', () => {
        expect(mockSpeech.isSubscribed).toBe(true);

        backend.dispose();

        expect(mockSpeech.isSubscribed).toBe(false);
    });

    it('queued transcripts are cleared on dispose', () => {
        // Queue a transcript but don't process it
        mockSpeech.pushTranscript('horse');

        backend.dispose();

        // Now update — should NOT process the transcript
        backend.update(0.016);
        expect(mockParticles.setTarget).not.toHaveBeenCalled();
    });
});
