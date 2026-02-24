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
import type { KeywordMapping } from '../data/keywords';
import { ParticleSystem } from '../engine/ParticleSystem';
import { UniformBridge } from '../engine/UniformBridge';
import { ServerShapeAdapter } from '../engine/ServerShapeAdapter';
import type { ServerClient } from './ServerClient';
import type { SessionLogger } from './SessionLogger';
import type { AudioEngine } from './AudioEngine';
import type { TuningConfig } from './TuningConfig';

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
const ABSTRACTION_DRIFT_RATE = 0.05;   // Rate abstraction rises when no keyword found
const DEFAULT_SHAPE = 'ring';

// Hierarchy traversal stage timing (seconds)
const HIERARCHY_STAGE_DELAYS = [0.0, 0.5, 1.5]; // T+0s, T+0.5s, T+1.5s
const HIERARCHY_ABSTRACTIONS = [0.9, 0.5];       // Stages 0 and 1 use these; stage 2 uses the keyword's own

// ── TRANSITION CHOREOGRAPHY (S12) ───────────────────────────────────
// Phase durations in seconds (base values — scaled by audio energy).
export const TransitionPhase = {
    Idle: 0,
    Dissolve: 1,
    Reform: 2,
    Settle: 3,
} as const;
export type TransitionPhase = (typeof TransitionPhase)[keyof typeof TransitionPhase];

const BASE_DISSOLVE_DURATION = 0.3;  // Particles scatter from current formation
const BASE_REFORM_DURATION = 0.7;    // Particles pulled to new target
const BASE_SETTLE_DURATION = 0.5;    // Noise reduces, spring overshoots then eases

// Spring/noise modulation during transition phases
const DISSOLVE_SPRING = 0.4;         // Weak spring → particles scatter
const DISSOLVE_NOISE = 0.6;          // High noise → chaotic scatter
const REFORM_SPRING_START = 0.8;     // Moderate spring → pulls to new target
const REFORM_SPRING_END = 1.5;       // Gradually restoring
const REFORM_NOISE = 0.35;           // Still elevated noise
const SETTLE_SPRING_OVERSHOOT = 2.0; // Briefly tighter than normal
const SETTLE_SPRING_FINAL = 1.5;     // Eases back to normal
const SETTLE_NOISE = 0.15;           // Nearly normal noise

// Idle decay constants
const IDLE_DECAY_DURATION = 30.0;    // 30 seconds for gradual return to ring

export class SemanticBackend {
    // ── DEPENDENCIES ─────────────────────────────────────────────────
    private speechEngine: SpeechEngine;
    private classifier: KeywordClassifier;
    private particleSystem: ParticleSystem;
    private uniformBridge: UniformBridge;
    private sessionLogger: SessionLogger | null;
    private serverClient: ServerClient | null;
    private audioEngine: AudioEngine | null;
    private tuningConfig: TuningConfig | null;

    // ── STATE ────────────────────────────────────────────────────────
    private currentTarget: string = DEFAULT_SHAPE;
    private currentAbstraction: number = 0.5;
    private targetAbstraction: number = 0.5;

    // Single silence timer — resets to 0 on ANY transcript.
    // Used for both loosening gate (>2s) and idle reset (>300s).
    private timeSinceLastUtterance: number = 0;

    private isLoosening: boolean = false;
    private loosenTimer: number = 0;

    // Full phrase text stored during Complex mode.
    // Set in applyMorphFromPhrase(), consumed 0.3s later in executeMorphSwap().
    // If a new morph triggers during dissolve, this is overwritten — intentional
    // (latest-wins, same as mid-transition interruption behavior).
    private pendingFullText: string | null = null;

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

    // ── HIERARCHY TRAVERSAL STATE ─────────────────────────────────────
    private hierarchyActive: boolean = false;
    private hierarchyElapsed: number = 0;
    private hierarchyStageIndex: number = 0;
    private hierarchyMapping: KeywordMapping | null = null;
    private hierarchyFinalAbstraction: number = 0.5;
    private _hierarchyLabel: string = '';

    // ── TRANSITION CHOREOGRAPHY STATE (S12) ──────────────────────────
    private transitionPhase: TransitionPhase = TransitionPhase.Idle;
    private transitionElapsed: number = 0;
    private transitionDurations: [number, number, number] = [
        BASE_DISSOLVE_DURATION, BASE_REFORM_DURATION, BASE_SETTLE_DURATION
    ];
    // Pending target info: stored during Dissolve, applied during Reform
    private pendingMorphState: SemanticState | null = null;
    private pendingMorphMapping: KeywordMapping | null = null;

    // Idle decay state
    private idleDecayActive: boolean = false;
    private idleDecayElapsed: number = 0;
    private idleDecayStartAbstraction: number = 0.5;

    constructor(
        speechEngine: SpeechEngine,
        classifier: KeywordClassifier,
        particleSystem: ParticleSystem,
        uniformBridge: UniformBridge,
        sessionLogger?: SessionLogger | null,
        serverClient?: ServerClient | null,
        audioEngine?: AudioEngine | null,
        tuningConfig?: TuningConfig | null,
    ) {
        this.speechEngine = speechEngine;
        this.classifier = classifier;
        this.particleSystem = particleSystem;
        this.uniformBridge = uniformBridge;
        this.sessionLogger = sessionLogger || null;
        this.serverClient = serverClient || null;
        this.audioEngine = audioEngine || null;
        this.tuningConfig = tuningConfig || null;

        // Subscribe to transcript events — callback only queues, never mutates state
        this.unsubscribe = this.speechEngine.onTranscript(
            (event) => this.pendingTranscripts.push(event)
        );

        const mode = this.tuningConfig?.complexMode ? 'complex' : 'simple';
        console.log(
            `[SemanticBackend] Wired: Speech → Classification → Morph (mode: ${mode})` +
            (this.serverClient ? ' | Server shapes: ✅ enabled' : ' | Server shapes: ❌ disabled (no ServerClient)')
        );
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
        // After 5 minutes of no speech at all, start 30-second gradual decay.
        if (this.timeSinceLastUtterance > SILENCE_RESET_THRESHOLD && this.currentTarget !== DEFAULT_SHAPE && !this.idleDecayActive) {
            console.log('[SemanticBackend] 5-min silence — starting 30s gradual decay to ring');
            this.idleDecayActive = true;
            this.idleDecayElapsed = 0;
            this.idleDecayStartAbstraction = this.currentAbstraction;
            this.logEvent('', this.makeDefaultState(), 'hold');
        }

        // ── IDLE DECAY ANIMATION (30s gradual) ───────────────────────
        if (this.idleDecayActive) {
            this.idleDecayElapsed += dt;
            const progress = Math.min(1.0, this.idleDecayElapsed / IDLE_DECAY_DURATION);
            // Ease-out curve for smooth deceleration
            const eased = 1 - Math.pow(1 - progress, 2);

            // Gradually raise abstraction toward 1.0 (fluid)
            this.targetAbstraction = this.idleDecayStartAbstraction + (1.0 - this.idleDecayStartAbstraction) * eased;

            // Gradually reduce spring constant for floating feel
            this.uniformBridge.springOverride = 1.5 - eased * 0.8; // 1.5 → 0.7

            // At the end, switch to ring
            if (progress >= 1.0) {
                this.currentTarget = DEFAULT_SHAPE;
                this.particleSystem.setTarget(DEFAULT_SHAPE);
                this.idleDecayActive = false;
                this.uniformBridge.springOverride = null;
                console.log('[SemanticBackend] Idle decay complete — now ring');
            }
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
                this.uniformBridge.noiseOverride = null;
                console.log('[SemanticBackend] Loosening complete');
            }
        }

        // ── TRANSITION CHOREOGRAPHY TICK ──────────────────────────────
        this.tickTransition(dt);

        // ── HIERARCHY TRAVERSAL TICK ──────────────────────────────────
        if (this.hierarchyActive && this.hierarchyMapping) {
            this.hierarchyElapsed += dt;

            while (
                this.hierarchyStageIndex < 3 &&
                this.hierarchyElapsed >= HIERARCHY_STAGE_DELAYS[this.hierarchyStageIndex]
            ) {
                const stage = this.hierarchyStageIndex;
                const mapping = this.hierarchyMapping;

                const stageTarget = mapping.hierarchy[stage];
                if (stageTarget !== this.currentTarget) {
                    this.currentTarget = stageTarget;
                    this.particleSystem.setTarget(stageTarget);
                    console.log(
                        `[SemanticBackend] \u2728 Hierarchy stage ${stage}: ${stageTarget} ` +
                        `(label="${mapping.hierarchyLabels[stage]}")`
                    );
                }

                if (stage < 2) {
                    this.targetAbstraction = HIERARCHY_ABSTRACTIONS[stage];
                } else {
                    this.targetAbstraction = this.hierarchyFinalAbstraction;
                }

                this._hierarchyLabel = mapping.hierarchyLabels[stage];
                this.hierarchyStageIndex++;
            }

            if (this.hierarchyStageIndex >= 3) {
                this.hierarchyActive = false;
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
     * Get current hierarchy label (for ghost transcript / analysis panel).
     */
    get hierarchyLabel(): string {
        return this._hierarchyLabel;
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
        this.pendingFullText = null;
        // Clear overrides
        this.uniformBridge.abstractionOverride = null;
        this.uniformBridge.noiseOverride = null;
        this.uniformBridge.sentimentOverride = null;
        this.uniformBridge.emotionalIntensityOverride = null;
        this.uniformBridge.springOverride = null;
        this.transitionPhase = TransitionPhase.Idle;
        this.transitionElapsed = 0;
        this.pendingMorphState = null;
        this.pendingMorphMapping = null;
        this.idleDecayActive = false;
        console.log('[SemanticBackend] Disposed');
    }

    // ── PRIVATE ──────────────────────────────────────────────────────

    /**
     * Process a single transcript event. Called from update() after
     * draining the queue — never from the async callback.
     *
     * ROUTING:
     * - Interim events: reset silence timer and trigger loosening only.
     *   No classification — prevents per-word flickering.
     * - Final events (natural speech pauses):
     *   - Complex mode: bypass classifier, send full phrase to server.
     *   - Simple mode: classify → pre-built shapes via hierarchy.
     */
    private processTranscript(event: TranscriptEvent): void {
        // ── SPEECH AFTER MEANINGFUL SILENCE: LOOSEN ──────────────────
        // Only trigger loosening if there was a meaningful pause (>2s).
        // Rapid-fire speech (transcript every 0.5s) should NOT re-trigger
        // the noise bump — it would feel jittery.
        if (this.timeSinceLastUtterance > LOOSEN_SILENCE_GATE) {
            this.isLoosening = true;
            this.loosenTimer = LOOSEN_DURATION;
            this.uniformBridge.noiseOverride = LOOSEN_NOISE;
            console.log('[SemanticBackend] 🌊 Loosening — speech after silence');
            // Log with a lightweight default state for loosening events
            this.logEvent(event.text, this.makeDefaultState(), 'loosen');
        }

        // Reset silence timer on ANY transcript (interim or final)
        this.timeSinceLastUtterance = 0;

        // Log transcript event
        this.sessionLogger?.log('transcript', { text: event.text, isFinal: event.isFinal });

        // ── SKIP INTERIM EVENTS ──────────────────────────────────────
        // Only classify on final transcripts (natural speech pauses).
        // Interim events reset the silence timer (above) but don't
        // trigger morphs — prevents single-word flickering.
        if (!event.isFinal) return;

        // ── ROUTING: COMPLEX vs SIMPLE MODE ──────────────────────────
        const isComplex = this.tuningConfig?.complexMode ?? false;

        if (isComplex && this.serverClient) {
            // ── COMPLEX MODE ─────────────────────────────────────────
            // Bypass classifier for shape routing. Send every final
            // transcript to the server as a full-phrase prompt.
            // Still extract sentiment for color/movement.
            this.applyMorphFromPhrase(event.text);
        } else {
            // ── SIMPLE MODE ──────────────────────────────────────────
            // (Also reached if complex mode is on but no serverClient)
            if (isComplex && !this.serverClient) {
                console.warn(
                    '[SemanticBackend] ⚠️ Complex mode active but no ServerClient — ' +
                    'falling back to Simple mode classification'
                );
            }

            const state = this.classifier.classify(event.text);

            if (state.confidence > FINAL_CONFIDENCE_THRESHOLD) {
                // ── KEYWORD FOUND → MORPH ────────────────────────────
                this.applyMorph(state, event.text);
            } else {
                // ── NO KEYWORD → HOLD ────────────────────────────────
                // Don't change morph target. Slightly raise abstraction
                // (less certain = more fluid).
                this.targetAbstraction = Math.min(1.0,
                    this.targetAbstraction + ABSTRACTION_DRIFT_RATE
                );

                this._lastState = state;
                this._lastAction = 'hold';

                // Push sentiment only if we actually detected emotion words.
                if (Math.abs(state.sentiment) > 0.05) {
                    this.uniformBridge.sentimentOverride = state.sentiment;
                    this.uniformBridge.emotionalIntensityOverride = state.emotionalIntensity;
                }

                this.logEvent(event.text, state, 'hold');
                console.log(
                    `[SemanticBackend] HOLD — no keyword (confidence=${state.confidence.toFixed(2)})`
                );
            }
        }
    }

    /**
     * Complex mode: send the full phrase to the server for GPU-generated shape.
     *
     * Uses classifySentimentOnly() for color/movement (AFINN + action modifiers)
     * without keyword/dictionary lookup.
     *
     * Starts dissolve transition with hierarchy placeholder (if a known noun is
     * in the phrase) or ambient sphere while the server generates the shape.
     * When the server responds, the shape immediately replaces whatever
     * hierarchy stage is showing (latest-wins, same as mid-transition behavior).
     */
    private applyMorphFromPhrase(fullText: string): void {
        // Guard: skip empty/whitespace-only text (can happen with
        // garbled speech or browser quirks sending blank final events)
        const trimmed = fullText.trim();
        if (!trimmed) {
            console.warn('[SemanticBackend] ⚠️ Skipping empty phrase in Complex mode');
            return;
        }

        // Extract sentiment only — no keyword/dictionary lookup
        const sentimentResult = this.classifier.classifySentimentOnly(trimmed);

        // Store full text for immediate server request
        this.pendingFullText = trimmed;

        // Cancel idle decay if speech arrives
        if (this.idleDecayActive) {
            this.idleDecayActive = false;
            this.uniformBridge.springOverride = null;
        }

        // Find a known noun in the phrase for hierarchy placeholder.
        // Use direct dictionary lookup instead of classify() — avoids running
        // the disabled extractProbableNoun path and prevents future re-enablement
        // from silently affecting complex mode routing.
        const words = trimmed.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
        let placeholderWord = '';
        for (const word of words) {
            const mapping = this.classifier.lookupKeyword(word);
            if (mapping) {
                placeholderWord = word;
                break;
            }
        }

        // ── COMPLEX MODE: NO PROCEDURAL PLACEHOLDER ──────────────
        // Instead of dissolving to a hierarchy shape (horse/sphere/etc)
        // and then snapping to the server shape, we keep the particles
        // in their current formation with a gentle "thinking" loosening.
        // The server shape will arrive and smoothly replace it.
        this.pendingMorphState = {
            morphTarget: this.particleSystem.currentTarget, // keep current shape
            abstractionLevel: 0.3,
            sentiment: sentimentResult.sentiment,
            emotionalIntensity: sentimentResult.emotionalIntensity,
            dominantWord: placeholderWord || trimmed.split(/\s+/)[0] || '',
            confidence: 1.0,
        };
        this.pendingMorphMapping = null;

        // Skip the full dissolve→reform→settle transition.
        // Instead, apply a gentle loosening: soften spring + bump noise
        // so particles feel alive ("thinking") without jumping to a
        // different shape.
        this.transitionPhase = TransitionPhase.Idle;
        this.transitionElapsed = 0;

        // Gentle loosening — softer spring + subtle noise increase
        this.uniformBridge.springOverride = 2.0;  // Softer than normal (5.0) but not dissolve (0.3)
        this.uniformBridge.noiseOverride = 0.15;  // Subtle shimmer, not full dissolve noise

        // Fire server request immediately (no dissolve→reform cycle).
        // The server shape will arrive and replace the current formation.
        if (this.serverClient && this.pendingFullText) {
            const dominantWord = this.pendingMorphState?.dominantWord || trimmed.split(/\s+/)[0];
            console.log(
                `[SemanticBackend] 🌐 COMPLEX → server for "${this.pendingFullText}" (immediate)`,
            );
            this.requestServerShape(dominantWord, this.pendingFullText, this.particleSystem.currentTarget);
            this.pendingFullText = null;
        }

        this._lastState = this.pendingMorphState;
        this._lastAction = 'morph';

        this.uniformBridge.sentimentOverride = sentimentResult.sentiment;
        this.uniformBridge.emotionalIntensityOverride = sentimentResult.emotionalIntensity;

        this.logEvent(fullText, this.pendingMorphState, 'morph');

        // Log semantic event
        this.sessionLogger?.log('semantic', {
            dominantWord: this.pendingMorphState.dominantWord,
            morphTarget: this.pendingMorphState.morphTarget,
            abstractionLevel: this.pendingMorphState.abstractionLevel,
            sentiment: sentimentResult.sentiment,
            confidence: this.pendingMorphState.confidence,
            mode: 'complex',
            fullText,
        });

        console.log(
            `[SemanticBackend] 🧠 COMPLEX MODE — "${fullText}" → server (placeholder: ${this.pendingMorphState.morphTarget})`
        );
    }

    /**
     * Apply a morph target change from a classification result.
     *
     * TRANSITION CHOREOGRAPHY (S12):
     * Instead of directly swapping the morph target, we now go through
     * a dissolve→reform→settle sequence. The morph target swap happens
     * at the Reform phase transition, not immediately.
     *
     * MID-TRANSITION INTERRUPTION:
     * - During Dissolve/Reform: restart Dissolve with new target
     * - During Settle: start new Dissolve with new target
     * - During Idle: start Dissolve normally
     */
    private applyMorph(state: SemanticState, text: string): void {
        // Store pending morph info
        this.pendingMorphState = state;
        this.pendingMorphMapping = this.classifier.lookupKeyword(state.dominantWord);

        // Cancel idle decay if speech arrives
        if (this.idleDecayActive) {
            this.idleDecayActive = false;
            this.uniformBridge.springOverride = null;
        }

        // Compute audio-responsive phase durations
        this.computeTransitionDurations();

        // Start or restart Dissolve phase
        this.transitionPhase = TransitionPhase.Dissolve;
        this.transitionElapsed = 0;

        // Apply dissolve overrides
        this.uniformBridge.springOverride = DISSOLVE_SPRING;
        if (!this.isLoosening) {
            this.uniformBridge.noiseOverride = DISSOLVE_NOISE;
        }

        this._lastState = state;
        this._lastAction = 'morph';

        this.uniformBridge.sentimentOverride = state.sentiment;
        this.uniformBridge.emotionalIntensityOverride = state.emotionalIntensity;
        this.logEvent(text, state, 'morph');

        // Log semantic event
        this.sessionLogger?.log('semantic', {
            dominantWord: state.dominantWord,
            morphTarget: state.morphTarget,
            abstractionLevel: state.abstractionLevel,
            sentiment: state.sentiment,
            confidence: state.confidence,
        });
    }

    /**
     * Tick the transition state machine. Called every frame from update().
     */
    private tickTransition(dt: number): void {
        if (this.transitionPhase === TransitionPhase.Idle) return;

        this.transitionElapsed += dt;

        switch (this.transitionPhase) {
            case TransitionPhase.Dissolve:
                this.tickDissolve();
                break;
            case TransitionPhase.Reform:
                this.tickReform();
                break;
            case TransitionPhase.Settle:
                this.tickSettle();
                break;
        }
    }

    /**
     * Dissolve phase: particles scatter from current formation.
     * At end → switch morph target and enter Reform.
     */
    private tickDissolve(): void {
        const duration = this.transitionDurations[0];
        if (this.transitionElapsed >= duration) {
            // Dissolve complete → switch target and enter Reform
            this.executeMorphSwap();

            this.transitionPhase = TransitionPhase.Reform;
            this.transitionElapsed = 0;
            this.uniformBridge.springOverride = REFORM_SPRING_START;
            this.uniformBridge.noiseOverride = REFORM_NOISE;

            console.log('[SemanticBackend] Transition: Dissolve → Reform');
        }
    }

    /**
     * Reform phase: particles are pulled to new target positions.
     * Spring constant gradually restores.
     */
    private tickReform(): void {
        const duration = this.transitionDurations[1];
        const progress = Math.min(1.0, this.transitionElapsed / duration);

        // Gradually restore spring (lerp from start to end)
        this.uniformBridge.springOverride = REFORM_SPRING_START + (REFORM_SPRING_END - REFORM_SPRING_START) * progress;

        // Gradually reduce noise
        const reformNoise = REFORM_NOISE * (1.0 - progress * 0.5);
        this.uniformBridge.noiseOverride = reformNoise;

        if (this.transitionElapsed >= duration) {
            this.transitionPhase = TransitionPhase.Settle;
            this.transitionElapsed = 0;
            this.uniformBridge.springOverride = SETTLE_SPRING_OVERSHOOT;
            this.uniformBridge.noiseOverride = SETTLE_NOISE;

            console.log('[SemanticBackend] Transition: Reform → Settle');
        }
    }

    /**
     * Settle phase: noise reduces to normal, spring overshoots then eases.
     */
    private tickSettle(): void {
        const duration = this.transitionDurations[2];
        const progress = Math.min(1.0, this.transitionElapsed / duration);

        // Spring overshoots then eases back: overshoot → final
        this.uniformBridge.springOverride = SETTLE_SPRING_OVERSHOOT + (SETTLE_SPRING_FINAL - SETTLE_SPRING_OVERSHOOT) * progress;

        // Noise eases to null (back to normal)
        const settleNoise = SETTLE_NOISE * (1.0 - progress);
        this.uniformBridge.noiseOverride = settleNoise > 0.01 ? settleNoise : null;

        if (this.transitionElapsed >= duration) {
            // Transition complete → back to Idle
            this.transitionPhase = TransitionPhase.Idle;
            this.uniformBridge.springOverride = null;
            this.uniformBridge.noiseOverride = null;

            console.log('[SemanticBackend] Transition: Settle → Idle');
        }
    }

    /**
     * Execute the actual morph target swap. Called at the Dissolve→Reform boundary.
     * This is where the pending morph target is applied to the particle system.
     */
    private executeMorphSwap(): void {
        const state = this.pendingMorphState;
        if (!state) return;
        const mapping = this.pendingMorphMapping;

        // ── STEP 1: LOCAL PLACEHOLDER ─────────────────────────────────
        // Set up a hierarchy traversal or direct shape as visual placeholder.
        // In complex mode this serves as the placeholder while the server
        // generates the real shape.

        if (mapping) {
            // Start hierarchy traversal (overwrites any in-progress one)
            this.hierarchyActive = true;
            this.hierarchyElapsed = 0;
            this.hierarchyStageIndex = 0;
            this.hierarchyMapping = mapping;
            this.hierarchyFinalAbstraction = state.abstractionLevel;
            this._hierarchyLabel = mapping.hierarchyLabels[0];

            if (state.emotionalIntensity > 0.5) {
                this.hierarchyFinalAbstraction = Math.max(0.0,
                    this.hierarchyFinalAbstraction - (state.emotionalIntensity - 0.5) * 0.3
                );
            }

            console.log(
                `[SemanticBackend] \ud83c\udfaf HIERARCHY START \u2192 "${state.morphTarget}" ` +
                `(word="${state.dominantWord}", stages=${mapping.hierarchy.join('\u2192')})`
            );
        } else {
            // No hierarchy — set morphTarget directly if available locally
            if (this.particleSystem.morphTargets.hasTarget(state.morphTarget)) {
                if (state.morphTarget !== this.currentTarget) {
                    this.currentTarget = state.morphTarget;
                    this.particleSystem.setTarget(state.morphTarget);
                }
            }

            this.targetAbstraction = state.abstractionLevel;

            if (state.emotionalIntensity > 0.5) {
                this.targetAbstraction = Math.max(0.0,
                    this.targetAbstraction - (state.emotionalIntensity - 0.5) * 0.3
                );
            }
        }

        // ── STEP 2: SERVER REQUEST ────────────────────────────────────
        // If we have a pendingFullText, fire the server request. This
        // happens in Complex mode (full phrase → server) and in Simple
        // mode for novel nouns (words with no local target).

        const isComplex = this.tuningConfig?.complexMode ?? false;

        if (isComplex && this.serverClient && this.pendingFullText) {
            // Complex mode: always send full phrase to server
            console.log(
                `[SemanticBackend] \ud83c\udf10 COMPLEX → server for "${this.pendingFullText}" ` +
                `(placeholder: ${state.morphTarget})`
            );
            this.requestServerShape(state.dominantWord, this.pendingFullText, state.morphTarget);
            this.pendingFullText = null;
        } else if (!mapping && !this.particleSystem.morphTargets.hasTarget(state.morphTarget) && this.serverClient) {
            // Simple mode fallback: novel noun with no local target → server
            console.log(`[SemanticBackend] \ud83c\udf10 Novel noun "${state.dominantWord}" → requesting server shape`);
            this.requestServerShape(state.dominantWord, state.dominantWord, state.morphTarget);
        }
    }

    /**
     * Request a shape from the server.
     *
     * @param word - The dominant noun (used as cache key / label)
     * @param prompt - The text sent to the server as the generation prompt.
     *   In Complex mode this is the full phrase ("a dragon blows fire").
     *   In Simple mode this is the dominant noun ("dragon").
     * @param fallbackTarget - Local shape name to fall back to on failure.
     */
    private requestServerShape(word: string, prompt: string, fallbackTarget: string): void {
        if (!this.serverClient) return;

        // Log the request
        this.sessionLogger?.log('system', {
            event: 'server_request',
            noun: word,
            prompt,
            timestamp: Date.now(),
        });

        console.log(`[SemanticBackend] 🌐 Requesting server shape: prompt="${prompt}"`);

        this.serverClient.generateShape(prompt).then((response) => {
            if (response) {
                // Read scale at response time (not request time) so live
                // tuner changes during the async server call are respected.
                const shapeScale = this.tuningConfig?.get('serverShapeScale') ?? 1.5;

                // Success — convert to DataTexture with TuningConfig scale
                const texture = ServerShapeAdapter.toDataTexture(
                    response,
                    this.particleSystem.size,
                    shapeScale,
                );
                this.particleSystem.setTargetTexture(texture, word);
                this.currentTarget = word;

                // Cancel hierarchy placeholder traversal — the real
                // server shape has landed. Without this, hierarchy stage 2/3
                // would overwrite the server shape ~1.5s later.
                if (this.hierarchyActive) {
                    this.hierarchyActive = false;
                    console.log('[SemanticBackend] Hierarchy cancelled — server shape arrived');
                }

                // Restore physics from "thinking" loosening —
                // clear spring/noise overrides so particles snap firmly
                // to the new server shape using the config baseline.
                this.uniformBridge.springOverride = null;
                this.uniformBridge.noiseOverride = null;

                console.log(
                    `[SemanticBackend] ✅ Server shape received: prompt="${prompt}" ` +
                    `(${response.pipeline}, ${response.generationTimeMs}ms, ` +
                    `${response.partNames.length} parts, scale=${shapeScale})`,
                );

                // Log the response
                this.sessionLogger?.log('system', {
                    event: 'server_response',
                    noun: word,
                    prompt,
                    cached: response.cached,
                    pipeline: response.pipeline,
                    generationTimeMs: response.generationTimeMs,
                    partCount: response.partNames.length,
                    templateType: response.templateType,
                });
            } else {
                // Failed — fall back to closest local shape
                console.warn(
                    `[SemanticBackend] ⚠️ Server failed for prompt="${prompt}", ` +
                    `falling back to "${fallbackTarget}"`,
                );
                if (fallbackTarget !== this.currentTarget) {
                    this.currentTarget = fallbackTarget;
                    this.particleSystem.setTarget(fallbackTarget);
                }
            }
        });
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

    /**
     * Compute audio-responsive transition phase durations.
     * Higher energy (louder speech) → faster transitions.
     */
    private computeTransitionDurations(): void {
        let energyScale = 1.0;
        if (this.audioEngine) {
            const energy = this.audioEngine.getFeatures().energy;
            // lerp(1.5, 0.5, energy): low energy → 1.5x (slow), high energy → 0.5x (fast)
            energyScale = 1.5 - energy * 1.0;
        }

        this.transitionDurations = [
            BASE_DISSOLVE_DURATION * energyScale,
            BASE_REFORM_DURATION * energyScale,
            BASE_SETTLE_DURATION * energyScale,
        ];
    }

    /**
     * Get current transition phase (for testing/inspection).
     */
    get currentTransitionPhase(): TransitionPhase {
        return this.transitionPhase;
    }

    /**
     * Get current transition durations (for testing).
     */
    getTransitionDurations(): [number, number, number] {
        return [...this.transitionDurations] as [number, number, number];
    }

    /**
     * Check if idle decay animation is active (for testing).
     */
    get isIdleDecayActive(): boolean {
        return this.idleDecayActive;
    }
}
