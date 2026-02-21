/**
 * TuningPanel.test.tsx — Unit tests for the TuningPanel React component.
 *
 * WHAT WE'RE TESTING:
 * ───────────────────
 * TuningPanel is the collapsible sidebar UI that auto-generates sliders
 * from TuningConfig's PARAM_DEFS. It's a React component, so we use
 * React Testing Library (RTL) to render it in a virtual DOM and simulate
 * user interactions.
 *
 * WHY REACT TESTING LIBRARY?
 * ──────────────────────────
 * RTL's philosophy is "test the way users interact with your app."
 * Instead of testing internal state or implementation details, we:
 *   - Find elements by their text, labels, or roles (like a user would)
 *   - Click buttons and type into inputs (simulating real interactions)
 *   - Assert on what the user sees (text, styles, DOM presence)
 *
 * This makes tests resilient to refactoring — if you reorganize the
 * component's internals but the user experience stays the same, the
 * tests still pass.
 *
 * TEST STRATEGY:
 * ──────────────
 * We mock AudioEngine with a simple object that returns zeroes from
 * getFeatures(). TuningConfig is used as a real instance (not mocked)
 * because it's the class under test — we want to ensure the panel
 * correctly reads/writes to it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TuningPanel } from '../components/TuningPanel';
import { TuningConfig, PARAM_DEFS } from '../services/TuningConfig';

// ── MOCK AUDIO ENGINE ────────────────────────────────────────────────
// TuningPanel needs an AudioEngine reference to show live audio values.
// We mock it with a minimal object that returns zeroed features. This
// isolates the test from real microphone access and Meyda processing.
function createMockAudioEngine() {
    return {
        getFeatures: vi.fn().mockReturnValue({
            energy: 0,
            tension: 0,
            urgency: 0,
            breathiness: 0,
            flatness: 0,
            textureComplexity: 0,
            rolloff: 0,
        }),
        start: vi.fn(),
        stop: vi.fn(),
    } as any; // Cast to `any` because we only implement the subset used by TuningPanel.
}

// ── SETUP / TEARDOWN ─────────────────────────────────────────────────
let config: TuningConfig;
let mockAudioEngine: ReturnType<typeof createMockAudioEngine>;

beforeEach(() => {
    localStorage.clear();
    config = new TuningConfig();
    mockAudioEngine = createMockAudioEngine();
});

afterEach(() => {
    cleanup(); // Unmount all rendered components (prevents DOM leaks).
});

// ══════════════════════════════════════════════════════════════════════
// SUITE 1: PANEL VISIBILITY & CONTROLS
// ══════════════════════════════════════════════════════════════════════
describe('TuningPanel — Panel Controls', () => {
    it('renders the gear button', () => {
        render(<TuningPanel config={config} audioEngine={mockAudioEngine} />);

        // The gear button should always be visible (even when panel is closed).
        const gearBtn = screen.getByLabelText('Toggle tuning panel');
        expect(gearBtn).toBeInTheDocument();
    });

    it('clicking the gear button opens the panel', () => {
        const { container } = render(
            <TuningPanel config={config} audioEngine={mockAudioEngine} />
        );

        // Panel starts closed (no .open class).
        const panel = container.querySelector('.tuning-panel');
        expect(panel).not.toHaveClass('open');

        // Click gear → panel opens.
        fireEvent.click(screen.getByLabelText('Toggle tuning panel'));
        expect(panel).toHaveClass('open');
    });

    it('clicking the close button closes the panel', () => {
        const { container } = render(
            <TuningPanel config={config} audioEngine={mockAudioEngine} />
        );

        // Open the panel first.
        fireEvent.click(screen.getByLabelText('Toggle tuning panel'));
        const panel = container.querySelector('.tuning-panel');
        expect(panel).toHaveClass('open');

        // Click close (✕).
        fireEvent.click(screen.getByLabelText('Close tuning panel'));
        expect(panel).not.toHaveClass('open');
    });

    it('clicking the overlay closes the panel', () => {
        const { container } = render(
            <TuningPanel config={config} audioEngine={mockAudioEngine} />
        );

        // Open the panel.
        fireEvent.click(screen.getByLabelText('Toggle tuning panel'));
        const panel = container.querySelector('.tuning-panel');
        expect(panel).toHaveClass('open');

        // Click the overlay (the semi-transparent backdrop).
        const overlay = container.querySelector('.tuning-overlay');
        expect(overlay).toBeInTheDocument();
        fireEvent.click(overlay!);
        expect(panel).not.toHaveClass('open');
    });
});

// ══════════════════════════════════════════════════════════════════════
// SUITE 2: SLIDER RENDERING & INTERACTION
// ══════════════════════════════════════════════════════════════════════
describe('TuningPanel — Sliders', () => {
    it('renders a slider for every parameter in PARAM_DEFS', () => {
        render(<TuningPanel config={config} audioEngine={mockAudioEngine} />);

        // Open the panel so sliders are in the DOM.
        fireEvent.click(screen.getByLabelText('Toggle tuning panel'));

        // Each param should have a slider input with id="tuning-{key}".
        // Curve Shaping params are rendered as custom toggles, not sliders.
        for (const def of PARAM_DEFS) {
            if (def.group === '⚡ Curve Shaping') continue;
            const slider = document.getElementById(`tuning-${def.key}`);
            expect(slider).toBeInTheDocument();
        }
    });

    it('sliders show the correct default values', () => {
        render(<TuningPanel config={config} audioEngine={mockAudioEngine} />);
        fireEvent.click(screen.getByLabelText('Toggle tuning panel'));

        // Check a few known defaults.
        const pointSizeSlider = document.getElementById('tuning-pointSize') as HTMLInputElement;
        expect(pointSizeSlider.value).toBe('3');

        const springKSlider = document.getElementById('tuning-springK') as HTMLInputElement;
        expect(springKSlider.value).toBe('1.5');
    });

    it('moving a slider updates the config value', () => {
        render(<TuningPanel config={config} audioEngine={mockAudioEngine} />);
        fireEvent.click(screen.getByLabelText('Toggle tuning panel'));

        // Simulate changing the point size slider.
        const slider = document.getElementById('tuning-pointSize') as HTMLInputElement;
        fireEvent.change(slider, { target: { value: '4.0' } });

        // The underlying TuningConfig should reflect the new value.
        expect(config.get('pointSize')).toBe(4.0);
    });

    it('sliders have correct min, max, and step attributes', () => {
        render(<TuningPanel config={config} audioEngine={mockAudioEngine} />);
        fireEvent.click(screen.getByLabelText('Toggle tuning panel'));

        // Verify the pointSize slider's HTML attributes match PARAM_DEFS.
        const pointSizeDef = PARAM_DEFS.find(d => d.key === 'pointSize')!;
        const slider = document.getElementById('tuning-pointSize') as HTMLInputElement;

        expect(slider.min).toBe(String(pointSizeDef.min));
        expect(slider.max).toBe(String(pointSizeDef.max));
        expect(slider.step).toBe(String(pointSizeDef.step));
    });

    it('displays all section headings from PARAM_DEFS groups', () => {
        render(<TuningPanel config={config} audioEngine={mockAudioEngine} />);
        fireEvent.click(screen.getByLabelText('Toggle tuning panel'));

        // Collect unique group names from PARAM_DEFS.
        // Exclude '⚡ Curve Shaping' — that group is rendered as custom toggles,
        // not auto-generated sliders with section headings.
        const uniqueGroups = [...new Set(PARAM_DEFS.map(d => d.group))].filter(g => g !== '⚡ Curve Shaping');

        for (const group of uniqueGroups) {
            expect(screen.getByText(group)).toBeInTheDocument();
        }
    });
});

// ══════════════════════════════════════════════════════════════════════
// SUITE 3: ACTION BUTTONS
// ══════════════════════════════════════════════════════════════════════
describe('TuningPanel — Action Buttons', () => {
    it('Reset button restores all values to defaults', () => {
        render(<TuningPanel config={config} audioEngine={mockAudioEngine} />);
        fireEvent.click(screen.getByLabelText('Toggle tuning panel'));

        // Change some values via config.
        config.set('pointSize', 5.0);
        config.set('springK', 8.0);

        // Click "Reset All to Defaults".
        fireEvent.click(screen.getByText('Reset All to Defaults'));

        // Config values should be back to defaults.
        expect(config.get('pointSize')).toBe(3.0);
        expect(config.get('springK')).toBe(1.5);
    });

    it('Apply Pasted Config button is disabled when textarea is empty', () => {
        render(<TuningPanel config={config} audioEngine={mockAudioEngine} />);
        fireEvent.click(screen.getByLabelText('Toggle tuning panel'));

        // The "Apply Pasted Config" button should be disabled by default
        // because the textarea is empty.
        const pasteBtn = screen.getByText('Apply Pasted Config');
        expect(pasteBtn).toBeDisabled();
    });

    it('pasting valid JSON and clicking Apply updates config', () => {
        render(<TuningPanel config={config} audioEngine={mockAudioEngine} />);
        fireEvent.click(screen.getByLabelText('Toggle tuning panel'));

        // Type valid JSON into the paste textarea.
        const textarea = screen.getByPlaceholderText('Paste config JSON here...');
        const testJson = JSON.stringify({ pointSize: 6.0, springK: 4.0 });
        fireEvent.change(textarea, { target: { value: testJson } });

        // Click "Apply Pasted Config".
        fireEvent.click(screen.getByText('Apply Pasted Config'));

        // Config should have the pasted values.
        expect(config.get('pointSize')).toBe(6.0);
        expect(config.get('springK')).toBe(4.0);
    });
});

// ══════════════════════════════════════════════════════════════════════
// SUITE 4: LIVE AUDIO VALUES
// ══════════════════════════════════════════════════════════════════════
describe('TuningPanel — Live Audio Values', () => {
    it('displays live audio values for audio-related parameters', async () => {
        // Override the mock to return non-zero features.
        mockAudioEngine.getFeatures.mockReturnValue({
            energy: 0.75,
            tension: 0.5,
            urgency: 0.3,
            breathiness: 0.1,
            flatness: 0,
            textureComplexity: 0,
            rolloff: 0,
        });

        render(<TuningPanel config={config} audioEngine={mockAudioEngine} />);
        fireEvent.click(screen.getByLabelText('Toggle tuning panel'));

        // The live values are polled on a 33ms interval (only when open).
        // Wait for one polling cycle to populate the values.
        await vi.waitFor(() => {
            // Find the live-value spans — they should show the feature values.
            const liveValues = document.querySelectorAll('.tuning-live-value');
            // At least one live value should be displayed.
            expect(liveValues.length).toBeGreaterThan(0);
        }, { timeout: 200 });
    });
});
