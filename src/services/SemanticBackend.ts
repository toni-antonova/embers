/**
 * SemanticBackend — Orchestrates the Speech → Classification → Morph pipeline.
 *
 * WHAT THIS DOES:
 * ───────────────
 * Connects all the subsystems: when the user speaks, SpeechEngine provides
 * text transcripts, KeywordClassifier maps them to SemanticState (target shape,
 * abstraction level, sentiment), and this class drives ParticleSystem to morph
 * into the corresponding shape.
 *
 * The key visual effect is "temporal crystallization" — when a keyword is
 * recognized, particles don't snap instantly to the new shape. Instead, the
 * abstraction level animates smoothly from fluid (1.0) to concrete (0.0),
 * creating a gradual solidification that feels organic.
 *
 * ARCHITECTURE:
 * ─────────────
 * - Plain TypeScript class (not a React component)
 * - Frame-driven: `update(dt)` called from the animation loop in Canvas.tsx
 * - Transcript events are QUEUED in the async callback and DRAINED in update()
 *   to avoid race conditions where a transcript arrives mid-frame
 * - Pushes output through UniformBridge overrides (abstraction, noise)
 * - Does NOT reach into shader uniforms directly
 *
 * MID-CRYSTALLIZATION BEHAVIOR:
 * ─────────────────────────────
 * If a new keyword arrives while particles are still transitioning to the
 * previous shape, we simply swap the morph target texture and update the
 * target abstraction. ParticleSystem.setTarget() only swaps the GPU texture
 * that the spring forces pull toward — it does NOT reset particle positions.
 * The spring forces in velocity.frag.glsl handle the smooth transition
 * automatically. This means saying "horse ocean" rapidly will create a
 * fluid redirect from one shape to the next, not a jarring snap.
 *
 * IDLE BEHAVIOR:
 * ──────────────
 * - Short silence (<2s): keep everything, particles breathe
 * - Long continuous silence (>300s): slowly morph back to ring
 * - Speech after meaningful silence (>2s): brief "loosening" noise bump
 */

import { SpeechEngine } from './SpeechEngine';
import type { TranscriptEvent } from './SpeechEngine';
import { KeywordClassifier } from './KeywordClassifier';
import type { SemanticState } from './KeywordClassifier';
import { ParticleSystem } from '../engine/ParticleSystem';
import { UniformBridge } from '../engine/UniformBridge';

// ── SEMANTIC EVENT LOG ───────────────────────────────────────────────
// Every semantic decision is logged for session replay / debugging.
export interface SemanticEvent {
    timestamp: number;
    text: string;
    classification: SemanticState;
    action: 'morph' | 'hold' | 'loosen';
}

// ── CONSTANTS ────────────────────────────────────────────────────────
const ABSTRACTION_LERP_RATE = 2.0;     // Speed of abstraction animation (per second)
const SILENCE_RESET_THRESHOLD = 300;   // 5 minutes continuous silence → reset to ring
const LOOSEN_DURATION = 0.3;           // Seconds of noise bump on speech start
const LOOSEN_NOISE = 0.3;             // Noise amplitude during loosening
const LOOSEN_SILENCE_GATE = 2.0;      // Min silence (seconds) before loosening triggers
const FINAL_CONFIDENCE_THRESHOLD = 0.3;
const INTERIM_CONFIDENCE_THRESHOLD = 0.6;
const INTERIM_DEBOUNCE_MS = 300;      // Min ms between morph actions from interims
const ABSTRACTION_DRIFT_RATE = 0.05;   // Rate abstraction rises when no keyword found
const IDLE_ABSTRACTION_RISE = 0.002;   // Rate abstraction drifts up during silence reset
const DEFAULT_SHAPE = 'ring';

export class SemanticBackend {
    // ── DEPENDENCIES ─────────────────────────────────────────────────
    private speechEngine: SpeechEngine;
    private classifier: KeywordClassifier;
    private particleSystem: ParticleSystem;
    private uniformBridge: UniformBridge;

    // ── STATE ────────────────────────────────────────────────────────
    private currentTarget: string = DEFAULT_SHAPE;
    private currentAbstraction: number = 0.5;
    private targetAbstraction: number = 0.5;

    // Single silence timer — resets to 0 on ANY transcript.
    // Used for both loosening gate (>2s) and idle reset (>300s).
    private timeSinceLastUtterance: number = 0;

    private isLoosening: boolean = false;
    private loosenTimer: number = 0;

    // Timestamp of last morph action (for interim debounce)
    private lastMorphTime: number = 0;

    // ── EVENT QUEUE ──────────────────────────────────────────────────
    // Transcripts arrive asynchronously from the browser's speech API.
    // We queue them here and drain in update() to avoid mutating state
    // in the middle of an animation frame.
    private pendingTranscripts: TranscriptEvent[] = [];

    // ── CALLBACK MANAGEMENT ──────────────────────────────────────────
    private unsubscribe: (() => void) | null = null;

    // ── EVENT LOG ────────────────────────────────────────────────────
    private eventLog: SemanticEvent[] = [];

    // ── LAST CLASSIFICATION (for UI display) ─────────────────────────
    private _lastState: SemanticState | null = null;
    private _lastAction: string = '';

    constructor(
        speechEngine: SpeechEngine,
        classifier: KeywordClassifier,
        particleSystem: ParticleSystem,
        uniformBridge: UniformBridge,
    ) {
        this.speechEngine = speechEngine;
        this.classifier = classifier;
        this.particleSystem = particleSystem;
        this.uniformBridge = uniformBridge;

        // Subscribe to transcript events — callback only queues, never mutates state
        this.unsubscribe = this.speechEngine.onTranscript(
            (event) => this.pendingTranscripts.push(event)
        );

        console.log('[SemanticBackend] Wired: Speech → Classification → Morph');
    }

    // ── PUBLIC API ───────────────────────────────────────────────────

    /**
     * Called every animation frame from Canvas.tsx.
     * 1. Drains the transcript queue (processes all pending events)
     * 2. Drives the abstraction lerp (temporal crystallization)
     * 3. Manages the loosening timer
     * 4. Tracks silence for idle reset
     */
    update(dt: number): void {
        // ── DRAIN TRANSCRIPT QUEUE ───────────────────────────────────
        // Process all transcripts that arrived since the last frame.
        // This ensures state mutations happen at a predictable point
        // in the frame, not asynchronously mid-render.
        const pending = this.pendingTranscripts;
        this.pendingTranscripts = [];
        for (const event of pending) {
            this.processTranscript(event);
        }

        // ── SILENCE TRACKING ─────────────────────────────────────────
        this.timeSinceLastUtterance += dt;

        // ── 5-MINUTE CONTINUOUS SILENCE RESET ────────────────────────
        // After 5 minutes of no speech at all, slowly drift back to ring.
        if (this.timeSinceLastUtterance > SILENCE_RESET_THRESHOLD && this.currentTarget !== DEFAULT_SHAPE) {
            console.log('[SemanticBackend] 5-min silence — drifting to ring');
            this.currentTarget = DEFAULT_SHAPE;
            this.particleSystem.setTarget(DEFAULT_SHAPE);
            this.targetAbstraction = 0.7; // Semi-fluid
            this.logEvent('', this.makeDefaultState(), 'hold');
        }

        // During extended silence, slowly raise abstraction for fluid breathing
        if (this.timeSinceLastUtterance > SILENCE_RESET_THRESHOLD) {
            this.targetAbstraction = Math.min(1.0,
                this.targetAbstraction + IDLE_ABSTRACTION_RISE * dt
            );
        }

        // ── ABSTRACTION LERP (temporal crystallization) ──────────────
        // Smoothly animate currentAbstraction → targetAbstraction.
        // This creates the gradual "solidification" or "loosening" effect.
        // If a new keyword arrives mid-crystallization, the target simply
        // changes and the lerp redirects smoothly — no discontinuity.
        const absDiff = this.targetAbstraction - this.currentAbstraction;
        this.currentAbstraction += absDiff * Math.min(1.0, ABSTRACTION_LERP_RATE * dt);

        // Push to UniformBridge override
        this.uniformBridge.abstractionOverride = this.currentAbstraction;

        // ── LOOSENING TIMER ──────────────────────────────────────────
        if (this.isLoosening) {
            this.loosenTimer -= dt;
            this.uniformBridge.noiseOverride = LOOSEN_NOISE;

            if (this.loosenTimer <= 0) {
                this.isLoosening = false;
                this.uniformBridge.noiseOverride = null; // Return to config value
                console.log('[SemanticBackend] Loosening complete');
            }
        }
    }

    /**
     * Get the event log for session export.
     */
    getEventLog(): ReadonlyArray<SemanticEvent> {
        return this.eventLog;
    }

    /**
     * Get the last classification result (for UI display).
     */
    get lastState(): SemanticState | null {
        return this._lastState;
    }

    /**
     * Get the last action taken (for UI display).
     */
    get lastAction(): string {
        return this._lastAction;
    }

    /**
     * Get current abstraction level (for UI display).
     */
    get abstraction(): number {
        return this.currentAbstraction;
    }

    /**
     * Clean up subscriptions.
     */
    dispose(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        this.pendingTranscripts = [];
        // Clear overrides
        this.uniformBridge.abstractionOverride = null;
        this.uniformBridge.noiseOverride = null;
        this.uniformBridge.sentimentOverride = null;
        console.log('[SemanticBackend] Disposed');
    }

    // ── PRIVATE ──────────────────────────────────────────────────────

    /**
     * Process a single transcript event. Called from update() after
     * draining the queue — never from the async callback.
     *
     * Final transcripts are processed at lower confidence threshold (0.3),
     * while interim transcripts require higher confidence (0.6) to avoid
     * false positives triggering premature morphs.
     */
    private processTranscript(event: TranscriptEvent): void {
        const state = this.classifier.classify(event.text);
        const threshold = event.isFinal
            ? FINAL_CONFIDENCE_THRESHOLD
            : INTERIM_CONFIDENCE_THRESHOLD;

        // ── SPEECH AFTER MEANINGFUL SILENCE: LOOSEN ──────────────────
        // Only trigger loosening if there was a meaningful pause (>2s).
        // Rapid-fire speech (transcript every 0.5s) should NOT re-trigger
        // the noise bump — it would feel jittery.
        if (this.timeSinceLastUtterance > LOOSEN_SILENCE_GATE) {
            this.isLoosening = true;
            this.loosenTimer = LOOSEN_DURATION;
            this.uniformBridge.noiseOverride = LOOSEN_NOISE;
            console.log('[SemanticBackend] 🌊 Loosening — speech after silence');
            this.logEvent(event.text, state, 'loosen');
        }

        // Reset silence timer on ANY transcript (interim or final)
        this.timeSinceLastUtterance = 0;

        if (state.confidence > threshold) {
            // ── INTERIM DEBOUNCE ─────────────────────────────────────
            // Interim results can fire 3-4x/sec with fluctuating confidence.
            // Two guards prevent flickering:
            // 1. Skip if the target is the SAME as current (no-op morph)
            // 2. Skip if less than 300ms since last morph action
            if (!event.isFinal) {
                const now = Date.now();
                if (state.morphTarget === this.currentTarget) {
                    // Same target — skip, no visual change needed
                    return;
                }
                if (now - this.lastMorphTime < INTERIM_DEBOUNCE_MS) {
                    // Too soon since last morph — skip to prevent flickering
                    return;
                }
            }

            // ── KEYWORD FOUND → MORPH ────────────────────────────────
            this.applyMorph(state, event.text);
        } else {
            // ── NO KEYWORD → HOLD ────────────────────────────────────
            // Don't change morph target. Slightly raise abstraction
            // (less certain = more fluid).
            this.targetAbstraction = Math.min(1.0,
                this.targetAbstraction + ABSTRACTION_DRIFT_RATE
            );

            this._lastState = state;
            this._lastAction = 'hold';

            // Still push sentiment — emotional context applies even without a morph
            this.uniformBridge.sentimentOverride = state.sentiment;

            if (event.isFinal) {
                this.logEvent(event.text, state, 'hold');
                console.log(
                    `[SemanticBackend] HOLD — no keyword (confidence=${state.confidence.toFixed(2)})`
                );
            }
        }
    }

    /**
     * Apply a morph target change from a classification result.
     *
     * IMPORTANT: ParticleSystem.setTarget() only swaps the morph target
     * TEXTURE — it does NOT reset particle positions. The spring forces
     * in velocity.frag.glsl pull particles toward the new target positions
     * automatically. This means mid-crystallization interruptions (e.g.,
     * saying "horse ocean" rapidly) create fluid redirects, not jarring snaps.
     */
    private applyMorph(state: SemanticState, text: string): void {
        // Only change target if it's different from current
        if (state.morphTarget !== this.currentTarget) {
            this.currentTarget = state.morphTarget;
            this.particleSystem.setTarget(state.morphTarget);
            console.log(
                `[SemanticBackend] 🎯 MORPH → "${state.morphTarget}" ` +
                `(word="${state.dominantWord}", conf=${state.confidence.toFixed(2)})`
            );
        }

        // Animate abstraction toward the classification's level.
        // Concrete nouns → low abstraction (solid shape).
        // Abstract concepts → higher abstraction (more fluid).
        this.targetAbstraction = state.abstractionLevel;

        // Feed emotional intensity back — high emotion = lower abstraction
        // (more "crystallized", sharper movements).
        if (state.emotionalIntensity > 0.5) {
            this.targetAbstraction = Math.max(0.0,
                this.targetAbstraction - (state.emotionalIntensity - 0.5) * 0.3
            );
        }

        this._lastState = state;
        this._lastAction = 'morph';
        this.lastMorphTime = Date.now();

        // Push sentiment for color shifting (warm/cool tint in rainbow mode)
        this.uniformBridge.sentimentOverride = state.sentiment;

        this.logEvent(text, state, 'morph');
    }

    /**
     * Create a default SemanticState for logging when no classification occurred.
     */
    private makeDefaultState(): SemanticState {
        return {
            morphTarget: this.currentTarget,
            abstractionLevel: this.targetAbstraction,
            sentiment: 0,
            emotionalIntensity: 0,
            dominantWord: '',
            confidence: 0,
        };
    }

    /**
     * Log a semantic event for session replay.
     */
    private logEvent(text: string, classification: SemanticState, action: SemanticEvent['action']): void {
        this.eventLog.push({
            timestamp: Date.now(),
            text,
            classification,
            action,
        });
    }
}
