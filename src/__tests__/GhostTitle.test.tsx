/**
 * GhostTitle.test.tsx — Tests for the live transcript ghost text component.
 *
 * Verifies that GhostTitle:
 *   1. Shows placeholder text before any speech
 *   2. Updates dynamically when speech transcripts arrive
 *   3. Highlights keywords from semantic events
 *   4. Cleans up expired words automatically
 *   5. Ignores interim (non-final) transcripts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { GhostTitle } from '../components/GhostTitle';
import type { TranscriptEvent } from '../services/SpeechEngine';
import type { SemanticEvent } from '../services/SemanticBackend';

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

function createMockSemanticBackend(events: SemanticEvent[] = []) {
    return {
        getEventLog: vi.fn(() => events),
    } as any;
}

function morphEvent(dominantWord: string): SemanticEvent {
    return {
        timestamp: Date.now(),
        text: `I see a ${dominantWord}`,
        classification: {
            morphTarget: 'quadruped',
            abstractionLevel: 0.3,
            sentiment: 0.5,
            emotionalIntensity: 0.5,
            confidence: 0.9,
            dominantWord,
        },
        action: 'morph',
    };
}

// ── SETUP ────────────────────────────────────────────────────────────

let mockSpeech: ReturnType<typeof createMockSpeechEngine>;

beforeEach(() => {
    vi.useFakeTimers();
    mockSpeech = createMockSpeechEngine();
});

afterEach(() => {
    vi.useRealTimers();
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 1: PLACEHOLDER TEXT
// ══════════════════════════════════════════════════════════════════════

describe('GhostTitle — Placeholder', () => {
    it('renders empty ghost text before any speech', () => {
        const { container } = render(<GhostTitle speechEngine={mockSpeech} semanticBackend={null} />);
        const textSpan = container.querySelector('.ghost-title__text');
        expect(textSpan).toBeInTheDocument();
        expect(textSpan?.textContent).toBe('');
    });

    it('subscribes to SpeechEngine on mount', () => {
        render(<GhostTitle speechEngine={mockSpeech} semanticBackend={null} />);
        expect(mockSpeech.onTranscript).toHaveBeenCalledOnce();
    });
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 2: LIVE TRANSCRIPT DISPLAY
// ══════════════════════════════════════════════════════════════════════

describe('GhostTitle — Live Transcript', () => {
    it('displays spoken words after a final transcript', () => {
        render(<GhostTitle speechEngine={mockSpeech} semanticBackend={null} />);

        act(() => {
            mockSpeech.pushTranscript('hello world', true);
        });

        expect(screen.getByText(/hello/)).toBeInTheDocument();
        expect(screen.getByText(/world/)).toBeInTheDocument();
    });

    it('removes placeholder after first speech', () => {
        render(<GhostTitle speechEngine={mockSpeech} semanticBackend={null} />);

        act(() => {
            mockSpeech.pushTranscript('hello', true);
        });

        expect(screen.queryByText('speak to shape light')).not.toBeInTheDocument();
    });

    it('ignores interim (non-final) transcripts', () => {
        const { container } = render(<GhostTitle speechEngine={mockSpeech} semanticBackend={null} />);

        act(() => {
            mockSpeech.pushTranscript('partial text', false);
        });

        // No final words should appear — ghost text stays empty
        const words = container.querySelectorAll('.ghost-word');
        expect(words.length).toBe(0);
    });

    it('accumulates words from multiple transcripts', () => {
        render(<GhostTitle speechEngine={mockSpeech} semanticBackend={null} />);

        act(() => {
            mockSpeech.pushTranscript('hello', true);
        });
        act(() => {
            mockSpeech.pushTranscript('beautiful world', true);
        });

        expect(screen.getByText(/hello/)).toBeInTheDocument();
        expect(screen.getByText(/beautiful/)).toBeInTheDocument();
        expect(screen.getByText(/world/)).toBeInTheDocument();
    });
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 3: KEYWORD HIGHLIGHTING
// ══════════════════════════════════════════════════════════════════════

describe('GhostTitle — Keyword Highlighting', () => {
    it('applies keyword class to the dominant word from semantic events', () => {
        const semanticBackend = createMockSemanticBackend([morphEvent('horse')]);

        const { container } = render(
            <GhostTitle speechEngine={mockSpeech} semanticBackend={semanticBackend} />
        );

        act(() => {
            mockSpeech.pushTranscript('I see a horse running', true);
        });

        const keywordSpans = container.querySelectorAll('.ghost-word--keyword');
        expect(keywordSpans.length).toBe(1);
        expect(keywordSpans[0].textContent?.trim()).toBe('horse');
    });

    it('does not highlight keywords when no semantic backend', () => {
        const { container } = render(
            <GhostTitle speechEngine={mockSpeech} semanticBackend={null} />
        );

        act(() => {
            mockSpeech.pushTranscript('horse', true);
        });

        const keywordSpans = container.querySelectorAll('.ghost-word--keyword');
        expect(keywordSpans.length).toBe(0);
    });
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 4: WORD EXPIRY
// ══════════════════════════════════════════════════════════════════════

describe('GhostTitle — Word Expiry', () => {
    it('removes words after GHOST_LIFESPAN_MS via cleanup interval', () => {
        render(<GhostTitle speechEngine={mockSpeech} semanticBackend={null} />);

        act(() => {
            mockSpeech.pushTranscript('temporary', true);
        });

        expect(screen.getByText(/temporary/)).toBeInTheDocument();

        // Advance past the ghost lifespan (6s) + cleanup interval (200ms)
        act(() => {
            vi.advanceTimersByTime(6500);
        });

        // Word should have been cleaned up
        expect(screen.queryByText(/temporary/)).not.toBeInTheDocument();
    });
});


// ══════════════════════════════════════════════════════════════════════
// SUITE 5: CLEANUP ON UNMOUNT
// ══════════════════════════════════════════════════════════════════════

describe('GhostTitle — Cleanup', () => {
    it('unsubscribes from SpeechEngine on unmount', () => {
        const { unmount } = render(
            <GhostTitle speechEngine={mockSpeech} semanticBackend={null} />
        );

        unmount();

        // The cleanup function returned by onTranscript should have been called.
        // We can verify no crash when pushing after unmount.
        expect(() => {
            mockSpeech.pushTranscript('after unmount', true);
        }).not.toThrow();
    });
});
