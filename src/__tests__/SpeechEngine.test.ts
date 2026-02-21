/**
 * SpeechEngine.test.ts — Unit tests for the speech recognition service.
 *
 * WHAT WE'RE TESTING:
 * ───────────────────
 * SpeechEngine wraps the Web Speech API and provides:
 *   1. Subscribe/unsubscribe for transcript events
 *   2. Text-input fallback via submitText()
 *   3. Graceful error handling (bad listeners, unsupported browsers)
 *   4. State management (isRunning, isSupported)
 *   5. Cleanup on stop()
 *
 * MOCK STRATEGY:
 * ──────────────
 * We mock window.webkitSpeechRecognition since the real Web Speech API
 * isn't available in Node.js / jsdom. We test the SpeechEngine's own
 * logic (subscriber management, submitText, error isolation) rather
 * than the browser's recognition accuracy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SpeechEngine } from '../services/SpeechEngine';

// ── MOCK WEB SPEECH API ──────────────────────────────────────────────

/** Minimal mock SpeechRecognition class usable with `new`. */
let lastMockInstance: any = null;

function createMockRecognitionClass() {
    class MockSpeechRecognition {
        continuous = false;
        interimResults = false;
        lang = '';
        onresult: any = null;
        onend: any = null;
        onerror: any = null;
        onstart: any = null;
        start = vi.fn(function (this: any) {
            if (this.onstart) this.onstart();
        });
        stop = vi.fn();
        abort = vi.fn();

        constructor() {
            lastMockInstance = this;
        }
    }
    return MockSpeechRecognition;
}


// ══════════════════════════════════════════════════════════════════════
// SUITE 1: SUBSCRIPTION MANAGEMENT
// ══════════════════════════════════════════════════════════════════════

describe('SpeechEngine — Subscriptions', () => {
    let engine: SpeechEngine;

    beforeEach(() => {
        // Ensure no SpeechRecognition exists → unsupported mode
        delete (window as any).SpeechRecognition;
        delete (window as any).webkitSpeechRecognition;
        engine = new SpeechEngine();
    });

    it('onTranscript returns an unsubscribe function', () => {
        const cb = vi.fn();
        const unsub = engine.onTranscript(cb);
        expect(typeof unsub).toBe('function');
    });

    it('subscriber receives events from submitText', () => {
        const cb = vi.fn();
        engine.onTranscript(cb);

        engine.submitText('hello');

        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith(
            expect.objectContaining({
                text: 'hello',
                isFinal: true,
            })
        );
    });

    it('unsubscribed listener no longer receives events', () => {
        const cb = vi.fn();
        const unsub = engine.onTranscript(cb);

        engine.submitText('first');
        expect(cb).toHaveBeenCalledTimes(1);

        unsub();
        engine.submitText('second');
        expect(cb).toHaveBeenCalledTimes(1); // still 1, not 2
    });

    it('multiple listeners all receive the same event', () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        const cb3 = vi.fn();

        engine.onTranscript(cb1);
        engine.onTranscript(cb2);
        engine.onTranscript(cb3);

        engine.submitText('test');

        expect(cb1).toHaveBeenCalledTimes(1);
        expect(cb2).toHaveBeenCalledTimes(1);
        expect(cb3).toHaveBeenCalledTimes(1);
    });

    it('a throwing listener does not crash other listeners', () => {
        const badCb = vi.fn().mockImplementation(() => {
            throw new Error('Listener exploded!');
        });
        const goodCb = vi.fn();

        engine.onTranscript(badCb);
        engine.onTranscript(goodCb);

        // Should NOT throw
        expect(() => engine.submitText('test')).not.toThrow();

        // Bad listener was called (and threw)
        expect(badCb).toHaveBeenCalledTimes(1);
        // Good listener was still called after the bad one
        expect(goodCb).toHaveBeenCalledTimes(1);
    });
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 2: submitText
// ══════════════════════════════════════════════════════════════════════

describe('SpeechEngine — submitText()', () => {
    let engine: SpeechEngine;

    beforeEach(() => {
        delete (window as any).SpeechRecognition;
        delete (window as any).webkitSpeechRecognition;
        engine = new SpeechEngine();
    });

    it('emits a TranscriptEvent with isFinal=true', () => {
        const cb = vi.fn();
        engine.onTranscript(cb);

        engine.submitText('ocean');

        expect(cb).toHaveBeenCalledWith(
            expect.objectContaining({
                text: 'ocean',
                isFinal: true,
                timestamp: expect.any(Number),
            })
        );
    });

    it('trims whitespace from submitted text', () => {
        const cb = vi.fn();
        engine.onTranscript(cb);

        engine.submitText('  horse  ');

        expect(cb).toHaveBeenCalledWith(
            expect.objectContaining({ text: 'horse' })
        );
    });

    it('ignores empty string', () => {
        const cb = vi.fn();
        engine.onTranscript(cb);

        engine.submitText('');
        engine.submitText('   ');
        engine.submitText('\t\n');

        expect(cb).not.toHaveBeenCalled();
    });
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 3: UNSUPPORTED BROWSER FALLBACK
// ══════════════════════════════════════════════════════════════════════

describe('SpeechEngine — Unsupported Browser', () => {
    it('isSupported is false when no SpeechRecognition in window', () => {
        delete (window as any).SpeechRecognition;
        delete (window as any).webkitSpeechRecognition;

        const engine = new SpeechEngine();
        expect(engine.isSupported).toBe(false);
    });

    it('start() still sets isRunning to true in fallback mode', () => {
        delete (window as any).SpeechRecognition;
        delete (window as any).webkitSpeechRecognition;

        const engine = new SpeechEngine();
        engine.start();
        expect(engine.isRunning).toBe(true);
    });
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 4: SUPPORTED BROWSER — START/STOP
// ══════════════════════════════════════════════════════════════════════

describe('SpeechEngine — With Web Speech API', () => {
    beforeEach(() => {
        lastMockInstance = null;
        (window as any).webkitSpeechRecognition = createMockRecognitionClass();
        delete (window as any).SpeechRecognition;
    });

    afterEach(() => {
        delete (window as any).webkitSpeechRecognition;
    });

    it('isSupported is true when webkitSpeechRecognition exists', () => {
        const engine = new SpeechEngine();
        expect(engine.isSupported).toBe(true);
    });

    it('start() creates a recognition instance and starts it', () => {
        lastMockInstance = null;
        const engine = new SpeechEngine();
        engine.start();

        expect(lastMockInstance).not.toBeNull();
        expect(lastMockInstance.start).toHaveBeenCalled();
        expect(lastMockInstance.continuous).toBe(true);
        expect(lastMockInstance.interimResults).toBe(true);
        expect(lastMockInstance.lang).toBe('en-US');
    });

    it('start() is a no-op when already running', () => {
        lastMockInstance = null;
        const engine = new SpeechEngine();
        engine.start();
        const firstInstance = lastMockInstance;

        engine.start(); // second call
        // Same instance — no new construction happened
        expect(lastMockInstance).toBe(firstInstance);
    });

    it('stop() aborts recognition and resets isRunning', () => {
        const engine = new SpeechEngine();
        engine.start();

        const instance = lastMockInstance;
        engine.stop();

        expect(instance.abort).toHaveBeenCalled();
        expect(engine.isRunning).toBe(false);
    });

    it('isRunning tracks state correctly across start/stop', () => {
        const engine = new SpeechEngine();

        expect(engine.isRunning).toBe(false);

        engine.start();
        expect(engine.isRunning).toBe(true);

        engine.stop();
        expect(engine.isRunning).toBe(false);
    });
});
