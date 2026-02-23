/**
 * STTManager.test.ts — Tests for the tiered STT manager.
 *
 * WHAT WE'RE TESTING:
 * ───────────────────
 * The STTManager wraps SpeechEngine and adds Moonshine as an async
 * upgrade path. We test:
 *   1. Constructor accepts SpeechEngine and wires up transcript relay
 *   2. onTranscript() subscribes and returns unsubscribe function
 *   3. getStatus() returns correct tier and listening state
 *   4. submitText() delegates to SpeechEngine
 *   5. dispose() cleans up listeners
 *
 * MOCK STRATEGY:
 * ──────────────
 * We don't mock Moonshine or @huggingface/transformers — those are
 * async background loads that degrade gracefully. We test the Web
 * Speech tier which is the immediate, synchronous path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpeechEngine } from '../services/SpeechEngine';
import { STTManager } from '../audio/stt-manager';

let speechEngine: SpeechEngine;
let manager: STTManager;

beforeEach(() => {
    // Ensure no SpeechRecognition → text fallback mode
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;

    speechEngine = new SpeechEngine();
    manager = new STTManager(speechEngine);
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 1: CONSTRUCTION & STATUS
// ══════════════════════════════════════════════════════════════════════

describe('STTManager — Status', () => {
    it('starts with webspeech tier', () => {
        const status = manager.getStatus();
        expect(status.engine).toBe('webspeech');
    });

    it('starts not listening', () => {
        const status = manager.getStatus();
        expect(status.isListening).toBe(false);
    });
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 2: SUBSCRIPTION
// ══════════════════════════════════════════════════════════════════════

describe('STTManager — Subscriptions', () => {
    it('onTranscript returns an unsubscribe function', () => {
        const cb = vi.fn();
        const unsub = manager.onTranscript(cb);
        expect(typeof unsub).toBe('function');
    });

    it('listeners receive events from submitText', () => {
        const cb = vi.fn();
        manager.onTranscript(cb);

        // submitText delegates to SpeechEngine, which emits back
        // through the STTManager's relay
        manager.submitText('hello');

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith(
            expect.objectContaining({
                text: 'hello',
                isFinal: true,
            })
        );
    });

    it('unsubscribed listener stops receiving events', () => {
        const cb = vi.fn();
        const unsub = manager.onTranscript(cb);

        manager.submitText('first');
        expect(cb).toHaveBeenCalledTimes(1);

        unsub();
        manager.submitText('second');
        expect(cb).toHaveBeenCalledTimes(1); // still 1
    });

    it('multiple listeners all receive the same event', () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();

        manager.onTranscript(cb1);
        manager.onTranscript(cb2);

        manager.submitText('test');

        expect(cb1).toHaveBeenCalledTimes(1);
        expect(cb2).toHaveBeenCalledTimes(1);
    });

    it('a throwing listener does not crash other listeners', () => {
        const bad = vi.fn(() => { throw new Error('boom'); });
        const good = vi.fn();

        manager.onTranscript(bad);
        manager.onTranscript(good);

        expect(() => manager.submitText('test')).not.toThrow();
        expect(good).toHaveBeenCalledTimes(1);
    });
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 3: DISPOSE
// ══════════════════════════════════════════════════════════════════════

describe('STTManager — Dispose', () => {
    it('dispose() clears all listeners', () => {
        const cb = vi.fn();
        manager.onTranscript(cb);

        manager.dispose();
        manager.submitText('after dispose');

        // Listener should NOT fire — it was cleared
        expect(cb).toHaveBeenCalledTimes(0);
    });
});
