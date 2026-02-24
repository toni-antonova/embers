/**
 * GhostTitle — Live transcript ghost text behind the particle canvas.
 *
 * Renders the user's spoken words as ephemeral text that fades over time,
 * creating a cinematic "watermark" effect behind the particle visualization.
 * When no words have been spoken yet, shows a static placeholder phrase.
 *
 * Subscribes to SpeechEngine transcript events and uses GhostTranscript
 * utilities for word accumulation, keyword highlighting, and opacity fade.
 */

import { useState, useEffect, useRef } from 'react';
import type { SpeechEngine } from '../services/SpeechEngine';
import type { SemanticBackend, SemanticEvent } from '../services/SemanticBackend';
import {
    accumulateGhostWords,
    cleanupExpiredWords,
    ghostWordOpacity,
} from '../services/GhostTranscript';
import type { GhostWord } from '../services/GhostTranscript';

const GHOST_CLEANUP_MS = 200;
const PLACEHOLDER_TEXT = '';

interface GhostTitleProps {
    speechEngine: SpeechEngine;
    semanticBackend: SemanticBackend | null;
}

export function GhostTitle({ speechEngine, semanticBackend }: GhostTitleProps) {
    const [ghostWords, setGhostWords] = useState<GhostWord[]>([]);
    const ghostIdCounter = useRef(0);
    const [hasSpoken, setHasSpoken] = useState(false);

    // Subscribe to speech transcript events
    useEffect(() => {
        const unsub = speechEngine.onTranscript((event) => {
            if (!event.isFinal) return;

            setHasSpoken(true);

            // Get latest semantic event for keyword detection
            let lastSemantic: SemanticEvent | null = null;
            if (semanticBackend) {
                const log = semanticBackend.getEventLog();
                if (log.length > 0) {
                    lastSemantic = log[log.length - 1];
                }
            }

            setGhostWords(prev => {
                const result = accumulateGhostWords(
                    prev,
                    event,
                    lastSemantic,
                    ghostIdCounter.current,
                );
                ghostIdCounter.current = result.nextId;
                return result.words;
            });
        });

        return unsub;
    }, [speechEngine, semanticBackend]);

    // Periodic cleanup of expired ghost words
    useEffect(() => {
        const timer = setInterval(() => {
            setGhostWords(prev => cleanupExpiredWords(prev));
        }, GHOST_CLEANUP_MS);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="ghost-title">
            {hasSpoken && ghostWords.length > 0 ? (
                <span className="ghost-title__text ghost-title__text--live">
                    {ghostWords.map(gw => {
                        const opacity = ghostWordOpacity(gw);
                        return (
                            <span
                                key={gw.id}
                                className={`ghost-word${gw.isKeyword ? ' ghost-word--keyword' : ''}`}
                                style={{ opacity }}
                            >
                                {gw.text.replace(/[.,!?;:]/g, '')}{' '}
                            </span>
                        );
                    })}
                </span>
            ) : (
                <span className="ghost-title__text">{PLACEHOLDER_TEXT}</span>
            )}
        </div>
    );
}
