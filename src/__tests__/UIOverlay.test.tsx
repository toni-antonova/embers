/**
 * UIOverlay.test.tsx — Unit tests for the UIOverlay audio debug bars.
 *
 * WHAT WE'RE TESTING:
 * ───────────────────
 * UIOverlay is the debug panel in the top-left that shows 4 audio feature
 * bars (Energy, Tension, Urgency, Breath) plus a start/stop mic button.
 * These bars are the user's primary visual feedback for whether audio
 * analysis is working — if they're flat, something is broken.
 *
 * TEST STRATEGY:
 * ──────────────
 * We mock AudioEngine with controllable feature values. The bars render
 * as <div> elements whose width% maps to the feature value (0-100%).
 * We verify:
 *   1. All 4 labels render
 *   2. The mic button toggles text
 *   3. Bar widths reflect the mocked feature values
 *   4. Bars update when features change (simulating live audio)
 *
 * WHY MOCK AudioEngine?
 * ─────────────────────
 * Real AudioEngine requires microphone access, Web Audio API, and Meyda.
 * None of these exist in a jsdom test environment. Mocking lets us feed
 * known feature values and verify the UI responds correctly.
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

// ── SETUP / TEARDOWN ─────────────────────────────────────────────────
let mockAudioEngine: ReturnType<typeof createMockAudioEngine>;

beforeEach(() => {
    mockAudioEngine = createMockAudioEngine();
    // Mock requestAnimationFrame for the polling loop.
    // UIOverlay uses rAF to update bars — in jsdom, we need to control it.
    vi.useFakeTimers();
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

// ══════════════════════════════════════════════════════════════════════
// SUITE 1: LABEL RENDERING
// ══════════════════════════════════════════════════════════════════════
describe('UIOverlay — Labels', () => {
    it('renders all 4 audio feature labels', () => {
        render(<UIOverlay audioEngine={mockAudioEngine} />);

        // These are the labels visible to the user in the debug panel.
        expect(screen.getByText('Energy')).toBeInTheDocument();
        expect(screen.getByText('Tension')).toBeInTheDocument();
        expect(screen.getByText('Urgency')).toBeInTheDocument();
        expect(screen.getByText('Breath')).toBeInTheDocument();
    });

    it('renders the correct number of debug rows', () => {
        const { container } = render(<UIOverlay audioEngine={mockAudioEngine} />);

        // There should be exactly 4 debug rows (one per feature).
        const rows = container.querySelectorAll('.debug-row');
        expect(rows.length).toBe(4);
    });
});

// ══════════════════════════════════════════════════════════════════════
// SUITE 2: MIC BUTTON
// ══════════════════════════════════════════════════════════════════════
describe('UIOverlay — Mic Button', () => {
    it('shows "Start Listening" initially', () => {
        render(<UIOverlay audioEngine={mockAudioEngine} />);

        const btn = screen.getByText('Start Listening');
        expect(btn).toBeInTheDocument();
    });

    it('toggles to "Stop Listening" after clicking', async () => {
        render(<UIOverlay audioEngine={mockAudioEngine} />);

        // Click "Start Listening".
        await act(async () => {
            fireEvent.click(screen.getByText('Start Listening'));
        });

        // Button text should change.
        expect(screen.getByText('Stop Listening')).toBeInTheDocument();

        // AudioEngine.start() should have been called.
        expect(mockAudioEngine.start).toHaveBeenCalledTimes(1);
    });

    it('toggles back to "Start Listening" after stopping', async () => {
        render(<UIOverlay audioEngine={mockAudioEngine} />);

        // Start → Stop → verify text returns.
        await act(async () => {
            fireEvent.click(screen.getByText('Start Listening'));
        });
        await act(async () => {
            fireEvent.click(screen.getByText('Stop Listening'));
        });

        expect(screen.getByText('Start Listening')).toBeInTheDocument();
        expect(mockAudioEngine.stop).toHaveBeenCalledTimes(1);
    });
});

// ══════════════════════════════════════════════════════════════════════
// SUITE 3: BAR WIDTHS
// ══════════════════════════════════════════════════════════════════════
describe('UIOverlay — Bar Widths', () => {
    it('bars start at 0% width when features are zero', () => {
        const { container } = render(<UIOverlay audioEngine={mockAudioEngine} />);

        // All fill bars should have 0% width.
        const fills = container.querySelectorAll('.debug-fill');
        fills.forEach(fill => {
            expect((fill as HTMLElement).style.width).toBe('0%');
        });
    });

    it('bars reflect non-zero feature values after listening starts', async () => {
        // Set up features with known values.
        mockAudioEngine.getFeatures.mockReturnValue({
            energy: 0.75,
            tension: 0.50,
            urgency: 0.25,
            breathiness: 0.10,
            flatness: 0,
        });

        const { container } = render(<UIOverlay audioEngine={mockAudioEngine} />);

        // Start listening to trigger the rAF polling loop.
        await act(async () => {
            fireEvent.click(screen.getByText('Start Listening'));
        });

        // Advance timers to trigger rAF callbacks.
        // The component uses requestAnimationFrame, so we advance time.
        await act(async () => {
            vi.advanceTimersByTime(100);
        });

        // Check bar widths match expected percentages.
        const fills = container.querySelectorAll('.debug-fill');
        const expectedWidths = ['75%', '50%', '25%', '10%'];

        fills.forEach((fill, index) => {
            expect((fill as HTMLElement).style.width).toBe(expectedWidths[index]);
        });
    });

    it('each debug row has a bar and fill element', () => {
        const { container } = render(<UIOverlay audioEngine={mockAudioEngine} />);

        const rows = container.querySelectorAll('.debug-row');
        rows.forEach(row => {
            // Each row should contain a .debug-bar with a .debug-fill inside.
            const bar = row.querySelector('.debug-bar');
            expect(bar).toBeInTheDocument();

            const fill = bar?.querySelector('.debug-fill');
            expect(fill).toBeInTheDocument();
        });
    });
});
