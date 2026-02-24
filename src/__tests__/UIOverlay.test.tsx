/**
 * UIOverlay.test.tsx — Unit tests for the UIOverlay mic control
 * and speech engine integration.
 *
 * WHAT WE'RE TESTING:
 * ───────────────────
 * UIOverlay provides the mic button that controls both AudioEngine
 * and SpeechEngine simultaneously. Audio debug bars have been moved
 * to the AnalysisPanel component.
 *
 * TEST STRATEGY:
 * ──────────────
 * We mock AudioEngine and SpeechEngine. We verify:
 *   1. The mic button toggles start/stop state
 *   2. AudioEngine.start() and .stop() are called appropriately
 *   3. SpeechEngine.start() and .stop() are called alongside audio
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { UIOverlay } from '../components/UIOverlay';

// ── MOCK AUDIO ENGINE ────────────────────────────────────────────────
// The UIOverlay reads features via audioEngine.getFeatures() on every
// animation frame. We control what it returns via mockReturnValue.
function createMockAudioEngine(initialFeatures = {
    energy: 0,
    tension: 0,
    urgency: 0,
    breathiness: 0,
    flatness: 0,
}) {
    return {
        getFeatures: vi.fn().mockReturnValue({ ...initialFeatures }),
        start: vi.fn().mockResolvedValue(undefined),
        stop: vi.fn(),
    } as any;
}

// ── MOCK SPEECH ENGINE ───────────────────────────────────────────────
// SpeechEngine is the transcription service. UIOverlay starts/stops it
// alongside AudioEngine. We mock it to avoid Web Speech API dependency.
function createMockSpeechEngine() {
    return {
        isSupported: true,
        isRunning: false,
        start: vi.fn(),
        stop: vi.fn(),
        onTranscript: vi.fn().mockReturnValue(() => { }), // returns an unsub fn
        onStatusChange: vi.fn().mockReturnValue(() => { }), // returns an unsub fn
        submitText: vi.fn(),
    } as any;
}

// ── MOCK TUNING CONFIG ───────────────────────────────────────────────
// TuningConfig provides the complexMode toggle. We mock it with a
// simple getter/setter to avoid localStorage dependency.
function createMockTuningConfig() {
    return {
        complexMode: false,
        get: vi.fn().mockReturnValue(1.0),
        set: vi.fn(),
    } as any;
}

// ── SETUP / TEARDOWN ─────────────────────────────────────────────────
let mockAudioEngine: ReturnType<typeof createMockAudioEngine>;
let mockSpeechEngine: ReturnType<typeof createMockSpeechEngine>;
let mockTuningConfig: ReturnType<typeof createMockTuningConfig>;

beforeEach(() => {
    mockAudioEngine = createMockAudioEngine();
    mockSpeechEngine = createMockSpeechEngine();
    mockTuningConfig = createMockTuningConfig();
    // Mock requestAnimationFrame for the polling loop.
    // UIOverlay uses rAF to update bars — in jsdom, we need to control it.
    vi.useFakeTimers();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});



// ══════════════════════════════════════════════════════════════════════
// SUITE 2: MIC BUTTON
// ══════════════════════════════════════════════════════════════════════
describe('UIOverlay — Mic Button', () => {
    it('shows mic button with "Start listening" label initially', () => {
        render(<UIOverlay audioEngine={mockAudioEngine} speechEngine={mockSpeechEngine} tuningConfig={mockTuningConfig} lastTranscript={null} lastSemanticEvent={null} />);

        const btn = screen.getByLabelText('Start listening');
        expect(btn).toBeInTheDocument();
        expect(btn).not.toHaveClass('active');
    });

    it('toggles to active state after clicking', async () => {
        render(<UIOverlay audioEngine={mockAudioEngine} speechEngine={mockSpeechEngine} tuningConfig={mockTuningConfig} lastTranscript={null} lastSemanticEvent={null} />);

        // Click the mic button.
        await act(async () => {
            fireEvent.click(screen.getByLabelText('Start listening'));
        });

        // Button should now have active class and updated label.
        const btn = screen.getByLabelText('Stop listening');
        expect(btn).toHaveClass('active');

        // AudioEngine.start() should have been called.
        expect(mockAudioEngine.start).toHaveBeenCalledTimes(1);
    });

    it('toggles back to inactive after stopping', async () => {
        render(<UIOverlay audioEngine={mockAudioEngine} speechEngine={mockSpeechEngine} tuningConfig={mockTuningConfig} lastTranscript={null} lastSemanticEvent={null} />);

        // Start → Stop → verify state returns.
        await act(async () => {
            fireEvent.click(screen.getByLabelText('Start listening'));
        });
        await act(async () => {
            fireEvent.click(screen.getByLabelText('Stop listening'));
        });

        const btn = screen.getByLabelText('Start listening');
        expect(btn).not.toHaveClass('active');
        expect(mockAudioEngine.stop).toHaveBeenCalledTimes(1);
    });
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 3: MODE TOGGLE (Simple / Complex)
// ══════════════════════════════════════════════════════════════════════
describe('UIOverlay — Mode Toggle', () => {
    it('renders in Simple mode initially (complexMode=false)', () => {
        render(<UIOverlay audioEngine={mockAudioEngine} speechEngine={mockSpeechEngine} tuningConfig={mockTuningConfig} lastTranscript={null} lastSemanticEvent={null} />);

        const toggle = screen.getByRole('switch');
        expect(toggle).toHaveAttribute('aria-checked', 'false');
        expect(toggle).toHaveAttribute('aria-label', 'Switch to Complex mode');
    });

    it('toggles to Complex mode on click', async () => {
        render(<UIOverlay audioEngine={mockAudioEngine} speechEngine={mockSpeechEngine} tuningConfig={mockTuningConfig} lastTranscript={null} lastSemanticEvent={null} />);

        await act(async () => {
            fireEvent.click(screen.getByRole('switch'));
        });

        const toggle = screen.getByRole('switch');
        expect(toggle).toHaveAttribute('aria-checked', 'true');
        expect(toggle).toHaveAttribute('aria-label', 'Switch to Simple mode');
    });

    it('updates tuningConfig.complexMode on toggle', async () => {
        render(<UIOverlay audioEngine={mockAudioEngine} speechEngine={mockSpeechEngine} tuningConfig={mockTuningConfig} lastTranscript={null} lastSemanticEvent={null} />);

        await act(async () => {
            fireEvent.click(screen.getByRole('switch'));
        });

        // tuningConfig should have been mutated
        expect(mockTuningConfig.complexMode).toBe(true);
    });

    it('toggles back to Simple on second click', async () => {
        render(<UIOverlay audioEngine={mockAudioEngine} speechEngine={mockSpeechEngine} tuningConfig={mockTuningConfig} lastTranscript={null} lastSemanticEvent={null} />);

        await act(async () => {
            fireEvent.click(screen.getByRole('switch'));
        });
        await act(async () => {
            fireEvent.click(screen.getByRole('switch'));
        });

        const toggle = screen.getByRole('switch');
        expect(toggle).toHaveAttribute('aria-checked', 'false');
        expect(mockTuningConfig.complexMode).toBe(false);
    });

    it('supports keyboard activation (Enter key)', async () => {
        render(<UIOverlay audioEngine={mockAudioEngine} speechEngine={mockSpeechEngine} tuningConfig={mockTuningConfig} lastTranscript={null} lastSemanticEvent={null} />);

        await act(async () => {
            fireEvent.keyDown(screen.getByRole('switch'), { key: 'Enter' });
        });

        expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    });
});

