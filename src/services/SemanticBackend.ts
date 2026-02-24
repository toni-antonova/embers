/**
 * SemanticBackend — Speech → Classification → Morph pipeline orchestrator.
 * Uses frame-driven queued transcripts to avoid race conditions.
 *
 * A2/A3 MOTION PLAN INTEGRATION:
 * When a server shape arrives with partIds, this module:
 *   1. Builds a PartInfo[] from the server response
 *   2. Creates part attribute textures (partId + attachment weights)
 *   3. Uses Tier1Orchestrator to resolve verbs → templates
 *   4. Calls parseTemplate() → MotionPlanManager.crossfadeTo()
 *   5. Calls motionPlanManager.update() every frame for crossfade
 */

import { SpeechEngine } from './SpeechEngine';
import type { TranscriptEvent } from './SpeechEngine';
import { KeywordClassifier } from './KeywordClassifier';
import type { SemanticState } from './KeywordClassifier';
import type { KeywordMapping } from '../data/keywords';
import { ParticleSystem } from '../engine/ParticleSystem';
import { UniformBridge } from '../engine/UniformBridge';
import { ServerShapeAdapter } from '../engine/ServerShapeAdapter';
import { MotionPlanManager } from '../engine/particle-system-extensions';
import type { ServerClient, ServerShapeResponse } from './ServerClient';
import type { SessionLogger } from './SessionLogger';
import type { AudioEngine } from './AudioEngine';
import type { TuningConfig } from './TuningConfig';
import { Tier1Orchestrator } from '../lookup/tier1-orchestrator';
import { TemplateLibrary } from '../templates/template-library';
import { parseTemplate } from '../templates/template-parser';
import type { PartInfo, TemplateJSON } from '../templates/template-types';
import type { VerbHashData } from '../lookup/verb-hash-table';

// Import all 20 template JSONs
import actionEat from '../templates/templates/action_eat.json';
import actionJump from '../templates/templates/action_jump.json';
import actionNod from '../templates/templates/action_nod.json';
import actionShake from '../templates/templates/action_shake.json';
import actionSpeak from '../templates/templates/action_speak.json';
import actionSpin from '../templates/templates/action_spin.json';
import actionStretch from '../templates/templates/action_stretch.json';
import actionWave from '../templates/templates/action_wave.json';
import ambientFloat from '../templates/templates/ambient_float.json';
import ambientIdle from '../templates/templates/ambient_idle.json';
import ambientSway from '../templates/templates/ambient_sway.json';
import emotionHappy from '../templates/templates/emotion_happy.json';
import locomotionBiped from '../templates/templates/locomotion_biped.json';
import locomotionFly from '../templates/templates/locomotion_fly.json';
import locomotionHop from '../templates/templates/locomotion_hop.json';
import locomotionQuadruped from '../templates/templates/locomotion_quadruped.json';
import locomotionSwim from '../templates/templates/locomotion_swim.json';
import transformDissolve from '../templates/templates/transform_dissolve.json';
import transformExplode from '../templates/templates/transform_explode.json';
import transformGrow from '../templates/templates/transform_grow.json';

// Import verb hash table (pre-generated from generate-hash-table.ts)
import verbHashData from '../../data/verb-hash-table.json';

const ALL_TEMPLATES: TemplateJSON[] = [
    actionEat, actionJump, actionNod, actionShake, actionSpeak,
    actionSpin, actionStretch, actionWave, ambientFloat, ambientIdle,
    ambientSway, emotionHappy, locomotionBiped, locomotionFly,
    locomotionHop, locomotionQuadruped, locomotionSwim,
    transformDissolve, transformExplode, transformGrow,
] as unknown as TemplateJSON[];

const MOTION_CROSSFADE_MS = 800;

// Every semantic decision is logged for session replay / debugging
export interface SemanticEvent {
    timestamp: number;
    text: string;
    classification: SemanticState;
    action: 'morph' | 'hold' | 'loosen';
}

const ABSTRACTION_LERP_RATE = 2.0;
const SILENCE_RESET_THRESHOLD = 300;
const LOOSEN_DURATION = 0.3;
const LOOSEN_NOISE = 0.3;
const LOOSEN_SILENCE_GATE = 2.0;
const FINAL_CONFIDENCE_THRESHOLD = 0.3;
const ABSTRACTION_DRIFT_RATE = 0.05;
const DEFAULT_SHAPE = 'ring';

const HIERARCHY_STAGE_DELAYS = [0.0, 0.5, 1.5];
const HIERARCHY_ABSTRACTIONS = [0.9, 0.5];

export const TransitionPhase = {
    Idle: 0,
    Dissolve: 1,
    Reform: 2,
    Settle: 3,
} as const;
export type TransitionPhase = (typeof TransitionPhase)[keyof typeof TransitionPhase];

const BASE_DISSOLVE_DURATION = 0.3;
const BASE_REFORM_DURATION = 0.7;
const BASE_SETTLE_DURATION = 0.5;

const DISSOLVE_SPRING = 0.4;
const DISSOLVE_NOISE = 0.6;
const REFORM_SPRING_START = 0.8;
const REFORM_SPRING_END = 1.5;
const REFORM_NOISE = 0.35;
const SETTLE_SPRING_OVERSHOOT = 2.0;
const SETTLE_SPRING_FINAL = 1.5;
const SETTLE_NOISE = 0.15;

const IDLE_DECAY_DURATION = 30.0;

// Anticipation drift — gentle swirl while waiting for server shape.
// Particles drift very slowly toward the morph target so they look alive
// and "consolidating" rather than frozen. The ramp is intentionally so
// slow (20s cubic ease-in) that they never reach the target before the
// real server shape arrives (typically 2–10s).
//
// NOTE: uNoiseAmplitude is multiplied by 0.25 inside the shader to get
// the actual curl noise base, so ANTICIPATION_NOISE needs to be ~1.0
// to produce a visible ~0.25 effective swirl.
const ANTICIPATION_SPRING_START = 0.3;    // Weak but present pull
const ANTICIPATION_SPRING_END = 0.6;      // Still slower than normal (1.5)
const ANTICIPATION_NOISE = 1.0;           // ×0.25 in shader → 0.25 effective curl
const ANTICIPATION_NOISE_END = 0.6;       // Settles as spring grows
const ANTICIPATION_ABSTRACTION = 0.15;    // Slightly loosen formation for drift room
const ANTICIPATION_RAMP_DURATION = 20.0;  // 20s ramp — never completes in practice

export class SemanticBackend {
    private speechEngine: SpeechEngine;
    private classifier: KeywordClassifier;
    private particleSystem: ParticleSystem;
    private uniformBridge: UniformBridge;
    private sessionLogger: SessionLogger | null;
    private serverClient: ServerClient | null;
    private audioEngine: AudioEngine | null;
    private tuningConfig: TuningConfig | null;

    // ── A2/A3 Motion Plan Integration ──────────────────────────────
    // Lazy-initialized: MotionPlanManager injects uniforms into the
    // velocity shader, so it must only be created AFTER
    // gpuCompute.init() has compiled the shader. We defer creation
    // to when the first server shape arrives.
    private motionPlanManager: MotionPlanManager | null = null;
    private tier1Orchestrator: Tier1Orchestrator;
    private currentPartList: PartInfo[] | null = null;
    private lastVerbTemplateId: string | null = null;

    private currentTarget: string = DEFAULT_SHAPE;
    private currentAbstraction: number = 0.5;
    private targetAbstraction: number = 0.5;
    private timeSinceLastUtterance: number = 0;
    private isLoosening: boolean = false;
    private loosenTimer: number = 0;
    private pendingFullText: string | null = null;

    private pendingTranscripts: TranscriptEvent[] = [];
    private unsubscribe: (() => void) | null = null;
    private eventLog: SemanticEvent[] = [];

    private _lastState: SemanticState | null = null;
    private _lastAction: string = '';

    private hierarchyActive: boolean = false;
    private hierarchyElapsed: number = 0;
    private hierarchyStageIndex: number = 0;
    private hierarchyMapping: KeywordMapping | null = null;
    private hierarchyFinalAbstraction: number = 0.5;
    private _hierarchyLabel: string = '';

    private transitionPhase: TransitionPhase = TransitionPhase.Idle;
    private transitionElapsed: number = 0;
    private transitionDurations: [number, number, number] = [
        BASE_DISSOLVE_DURATION, BASE_REFORM_DURATION, BASE_SETTLE_DURATION
    ];
    private pendingMorphState: SemanticState | null = null;
    private pendingMorphMapping: KeywordMapping | null = null;

    private idleDecayActive: boolean = false;
    private idleDecayElapsed: number = 0;
    private idleDecayStartAbstraction: number = 0.5;

    // Anticipation drift state — activated during server shape processing
    private anticipationActive: boolean = false;
    private anticipationElapsed: number = 0;

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

        // ── Initialize A2/A3 Motion Plan System ──────────────────
        // NOTE: MotionPlanManager is lazy-initialized (see ensureMotionPlanManager)
        // to avoid injecting uniforms before the velocity shader is compiled.

        const templateLibrary = new TemplateLibrary();
        templateLibrary.loadTemplates(ALL_TEMPLATES);

        this.tier1Orchestrator = new Tier1Orchestrator(
            verbHashData as VerbHashData,
            templateLibrary
        );

        this.unsubscribe = this.speechEngine.onTranscript(
            (event) => this.pendingTranscripts.push(event)
        );

        const mode = this.tuningConfig?.complexMode ? 'complex' : 'simple';
        console.log(
            `[SemanticBackend] Wired: Speech → Classification → Morph (mode: ${mode})` +
            (this.serverClient ? ' | Server shapes: ✅ enabled' : ' | Server shapes: ❌ disabled (no ServerClient)') +
            ` | Motion plans: ✅ ${templateLibrary.size} templates, ${this.tier1Orchestrator.hashTableSize} verbs (lazy init)`
        );
    }

    update(dt: number): void {
        // Update motion plan crossfade animation (no-op if not yet initialized)
        this.motionPlanManager?.update();

        const pending = this.pendingTranscripts;
        this.pendingTranscripts = [];
        for (const event of pending) {
            this.processTranscript(event);
        }

        this.timeSinceLastUtterance += dt;

        if (this.timeSinceLastUtterance > SILENCE_RESET_THRESHOLD && this.currentTarget !== DEFAULT_SHAPE && !this.idleDecayActive) {
            console.log('[SemanticBackend] 5-min silence — starting 30s gradual decay to ring');
            this.idleDecayActive = true;
            this.idleDecayElapsed = 0;
            this.idleDecayStartAbstraction = this.currentAbstraction;
            this.logEvent('', this.makeDefaultState(), 'hold');
        }

        if (this.idleDecayActive) {
            this.idleDecayElapsed += dt;
            const progress = Math.min(1.0, this.idleDecayElapsed / IDLE_DECAY_DURATION);
            const eased = 1 - Math.pow(1 - progress, 2); // Ease-out

            this.targetAbstraction = this.idleDecayStartAbstraction + (1.0 - this.idleDecayStartAbstraction) * eased;
            this.uniformBridge.springOverride = 1.5 - eased * 0.8;

            if (progress >= 1.0) {
                this.currentTarget = DEFAULT_SHAPE;
                this.particleSystem.setTarget(DEFAULT_SHAPE);
                this.idleDecayActive = false;
                this.uniformBridge.springOverride = null;
                console.log('[SemanticBackend] Idle decay complete — now ring');
            }
        }

        const absDiff = this.targetAbstraction - this.currentAbstraction;
        this.currentAbstraction += absDiff * Math.min(1.0, ABSTRACTION_LERP_RATE * dt);
        this.uniformBridge.abstractionOverride = this.currentAbstraction;

        if (this.isLoosening) {
            this.loosenTimer -= dt;
            this.uniformBridge.noiseOverride = LOOSEN_NOISE;

            if (this.loosenTimer <= 0) {
                this.isLoosening = false;
                this.uniformBridge.noiseOverride = null;
                console.log('[SemanticBackend] Loosening complete');
            }
        }

        // ── ANTICIPATION DRIFT (server processing swirl) ──────────────
        if (this.anticipationActive) {
            this.anticipationElapsed += dt;
            const progress = Math.min(1.0, this.anticipationElapsed / ANTICIPATION_RAMP_DURATION);
            // Cubic ease-in: starts imperceptibly slow, gradually accelerates
            const eased = progress * progress * progress;
            const spring = ANTICIPATION_SPRING_START + (ANTICIPATION_SPRING_END - ANTICIPATION_SPRING_START) * eased;
            const noise = ANTICIPATION_NOISE + (ANTICIPATION_NOISE_END - ANTICIPATION_NOISE) * eased;
            this.uniformBridge.springOverride = spring;
            this.uniformBridge.noiseOverride = noise;
            // Slightly loosen formation so particles have room to swirl
            this.uniformBridge.abstractionOverride = Math.max(
                this.currentAbstraction,
                this.currentAbstraction + ANTICIPATION_ABSTRACTION * (1.0 - eased),
            );
        }

        this.tickTransition(dt);

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

    getEventLog(): ReadonlyArray<SemanticEvent> {
        return this.eventLog;
    }

    get lastState(): SemanticState | null {
        return this._lastState;
    }

    get lastAction(): string {
        return this._lastAction;
    }

    get abstraction(): number {
        return this.currentAbstraction;
    }

    get hierarchyLabel(): string {
        return this._hierarchyLabel;
    }

    dispose(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        this.motionPlanManager?.dispose();
        this.tier1Orchestrator.dispose();
        this.currentPartList = null;
        this.lastVerbTemplateId = null;
        this.pendingTranscripts = [];
        this.pendingFullText = null;
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
        this.anticipationActive = false;
        this.anticipationElapsed = 0;
        console.log('[SemanticBackend] Disposed');
    }

    private processTranscript(event: TranscriptEvent): void {
        if (this.timeSinceLastUtterance > LOOSEN_SILENCE_GATE) {
            this.isLoosening = true;
            this.loosenTimer = LOOSEN_DURATION;
            this.uniformBridge.noiseOverride = LOOSEN_NOISE;
            console.log('[SemanticBackend] 🌊 Loosening — speech after silence');
            this.logEvent(event.text, this.makeDefaultState(), 'loosen');
        }

        this.timeSinceLastUtterance = 0;
        this.sessionLogger?.log('transcript', { text: event.text, isFinal: event.isFinal });

        if (!event.isFinal) return;

        // ── Attempt verb → motion plan resolution ──────────────────
        this.tryActivateMotionPlan(event.text);

        const isComplex = this.tuningConfig?.complexMode ?? false;

        if (isComplex && this.serverClient) {
            this.applyMorphFromPhrase(event.text);
        } else {
            if (isComplex && !this.serverClient) {
                console.warn(
                    '[SemanticBackend] ⚠️ Complex mode active but no ServerClient — ' +
                    'falling back to Simple mode classification'
                );
            }

            const state = this.classifier.classify(event.text);

            if (state.confidence > FINAL_CONFIDENCE_THRESHOLD) {
                this.applyMorph(state, event.text);
            } else {
                this.targetAbstraction = Math.min(1.0,
                    this.targetAbstraction + ABSTRACTION_DRIFT_RATE
                );

                this._lastState = state;
                this._lastAction = 'hold';

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

    private applyMorphFromPhrase(fullText: string): void {
        const trimmed = fullText.trim();
        if (!trimmed) {
            console.warn('[SemanticBackend] ⚠️ Skipping empty phrase in Complex mode');
            return;
        }

        const sentimentResult = this.classifier.classifySentimentOnly(trimmed);
        this.pendingFullText = trimmed;

        if (this.idleDecayActive) {
            this.idleDecayActive = false;
            this.uniformBridge.springOverride = null;
        }

        const words = trimmed.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/);
        let placeholderWord = '';
        for (const word of words) {
            const mapping = this.classifier.lookupKeyword(word);
            if (mapping) {
                placeholderWord = word;
                break;
            }
        }

        this.pendingMorphState = {
            morphTarget: this.particleSystem.currentTarget,
            abstractionLevel: 0.3,
            sentiment: sentimentResult.sentiment,
            emotionalIntensity: sentimentResult.emotionalIntensity,
            dominantWord: placeholderWord || trimmed.split(/\s+/)[0] || '',
            confidence: 1.0,
        };
        this.pendingMorphMapping = null;

        this.transitionPhase = TransitionPhase.Idle;
        this.transitionElapsed = 0;

        this.uniformBridge.springOverride = 2.0;
        this.uniformBridge.noiseOverride = 0.15;

        if (this.serverClient && this.pendingFullText) {
            const dominantWord = this.pendingMorphState?.dominantWord || trimmed.split(/\s+/)[0];
            console.log(
                `[SemanticBackend] 🌐 COMPLEX → server for "${this.pendingFullText}" (immediate)`,
            );
            this.requestServerShape(dominantWord, this.pendingFullText, this.particleSystem.currentTarget);
            this.pendingFullText = null;

            // Activate anticipation drift — gentle swirl while server processes
            this.anticipationActive = true;
            this.anticipationElapsed = 0;
            console.log('[SemanticBackend] 🌀 Anticipation drift activated');
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

    private applyMorph(state: SemanticState, text: string): void {
        // Cancel anticipation if a new morph lands (simple mode or new keyword)
        this.anticipationActive = false;

        this.pendingMorphState = state;
        this.pendingMorphMapping = this.classifier.lookupKeyword(state.dominantWord);

        if (this.idleDecayActive) {
            this.idleDecayActive = false;
            this.uniformBridge.springOverride = null;
        }

        this.computeTransitionDurations();

        this.transitionPhase = TransitionPhase.Dissolve;
        this.transitionElapsed = 0;

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

    private tickDissolve(): void {
        const duration = this.transitionDurations[0];
        if (this.transitionElapsed >= duration) {
            this.executeMorphSwap();

            this.transitionPhase = TransitionPhase.Reform;
            this.transitionElapsed = 0;
            this.uniformBridge.springOverride = REFORM_SPRING_START;
            this.uniformBridge.noiseOverride = REFORM_NOISE;

            console.log('[SemanticBackend] Transition: Dissolve → Reform');
        }
    }

    private tickReform(): void {
        const duration = this.transitionDurations[1];
        const progress = Math.min(1.0, this.transitionElapsed / duration);

        this.uniformBridge.springOverride = REFORM_SPRING_START + (REFORM_SPRING_END - REFORM_SPRING_START) * progress;

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

    private tickSettle(): void {
        const duration = this.transitionDurations[2];
        const progress = Math.min(1.0, this.transitionElapsed / duration);

        this.uniformBridge.springOverride = SETTLE_SPRING_OVERSHOOT + (SETTLE_SPRING_FINAL - SETTLE_SPRING_OVERSHOOT) * progress;

        const settleNoise = SETTLE_NOISE * (1.0 - progress);
        this.uniformBridge.noiseOverride = settleNoise > 0.01 ? settleNoise : null;

        if (this.transitionElapsed >= duration) {
            this.transitionPhase = TransitionPhase.Idle;
            this.uniformBridge.springOverride = null;
            this.uniformBridge.noiseOverride = null;

            console.log('[SemanticBackend] Transition: Settle → Idle');
        }
    }

    private executeMorphSwap(): void {
        const state = this.pendingMorphState;
        if (!state) return;
        const mapping = this.pendingMorphMapping;

        if (mapping) {
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
                `[SemanticBackend] 🎯 HIERARCHY START → "${state.morphTarget}" ` +
                `(word="${state.dominantWord}", stages=${mapping.hierarchy.join('→')})`
            );
        } else {
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

        const isComplex = this.tuningConfig?.complexMode ?? false;

        if (isComplex && this.serverClient && this.pendingFullText) {
            console.log(
                `[SemanticBackend] 🌐 COMPLEX → server for "${this.pendingFullText}" ` +
                `(placeholder: ${state.morphTarget})`
            );
            this.requestServerShape(state.dominantWord, this.pendingFullText, state.morphTarget);
            this.pendingFullText = null;
            this.anticipationActive = true;
            this.anticipationElapsed = 0;
        } else if (!mapping && !this.particleSystem.morphTargets.hasTarget(state.morphTarget) && this.serverClient) {
            console.log(`[SemanticBackend] 🌐 Novel noun "${state.dominantWord}" → requesting server shape`);
            this.requestServerShape(state.dominantWord, state.dominantWord, state.morphTarget);
            this.anticipationActive = true;
            this.anticipationElapsed = 0;
        }
    }

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

                // ── A2/A3: extract part attributes + activate motion plan ──
                this.onServerShapeReceived(response, prompt);

                // Cancel hierarchy placeholder traversal — the real
                // server shape has landed. Without this, hierarchy stage 2/3
                // would overwrite the server shape ~1.5s later.
                if (this.hierarchyActive) {
                    this.hierarchyActive = false;
                    console.log('[SemanticBackend] Hierarchy cancelled — server shape arrived');
                }

                // Cancel anticipation drift — real shape has landed
                this.anticipationActive = false;
                this.anticipationElapsed = 0;

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
                // Cancel anticipation drift on failure too
                this.anticipationActive = false;
                this.anticipationElapsed = 0;
                this.uniformBridge.springOverride = null;
                this.uniformBridge.noiseOverride = null;

                // Clear motion plan on failure — no parts to animate
                this.currentPartList = null;
                this.motionPlanManager?.clearMotionPlan();

                if (fallbackTarget !== this.currentTarget) {
                    this.currentTarget = fallbackTarget;
                    this.particleSystem.setTarget(fallbackTarget);
                }
            }
        });
    }

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

    private logEvent(text: string, classification: SemanticState, action: SemanticEvent['action']): void {
        this.eventLog.push({
            timestamp: Date.now(),
            text,
            classification,
            action,
        });
    }

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
     * True when the server is processing a shape generation request.
     * Drives the UI spinner in UIOverlay.
     */
    get isProcessing(): boolean {
        return this.transitionPhase !== TransitionPhase.Idle ||
            (this.pendingFullText !== null);
    }

    get currentTransitionPhase(): TransitionPhase {
        return this.transitionPhase;
    }

    getTransitionDurations(): [number, number, number] {
        return [...this.transitionDurations] as [number, number, number];
    }

    get isIdleDecayActive(): boolean {
        return this.idleDecayActive;
    }


    // ── A2/A3 MOTION PLAN INTEGRATION ──────────────────────────────────

    /**
     * Called when a server shape response arrives.
     * Extracts part attributes and tries to activate a motion plan
     * based on the last resolved verb template.
     */
    private onServerShapeReceived(response: ServerShapeResponse, prompt: string): void {
        // ── DEBUG: raw server part data ──
        const uniqueIds = new Set(response.partIds);
        console.log(
            `[SemanticBackend] 🔬 Raw server part data:\n` +
            `  partNames: [${response.partNames.join(', ')}]\n` +
            `  unique partIds: [${[...uniqueIds].join(', ')}] (${response.partIds.length} total vertices)\n` +
            `  templateType: ${response.templateType}\n` +
            `  pipeline: ${response.pipeline}`,
        );

        // Build part info list from server response
        this.currentPartList = ServerShapeAdapter.buildPartList(response);

        // Create part attribute texture (partId + attachment weight per particle)
        const expandedPartIds = ServerShapeAdapter.expandPartIds(
            response,
            this.particleSystem.size,
        );
        const attachmentWeights = ServerShapeAdapter.computeAttachmentWeights(
            response,
            this.particleSystem.size,
        );
        // Lazy-init MotionPlanManager on first server shape arrival
        // (deferred to avoid injecting uniforms before shader compilation)
        if (!this.motionPlanManager) {
            this.motionPlanManager = new MotionPlanManager(
                this.particleSystem.getVelocityUniforms(),
                this.particleSystem.size,
            );
            console.log('[SemanticBackend] 📦 MotionPlanManager lazy-initialized');
        }

        this.motionPlanManager.createPartAttributeTexture(
            expandedPartIds,
            attachmentWeights,
        );

        console.log(
            `[SemanticBackend] 🦴 Part attributes set: ${this.currentPartList.length} parts ` +
            `(${this.currentPartList.map(p => p.name).join(', ')})`,
        );

        // If we already have a resolved verb template, activate it now
        // that we have part data to animate
        if (this.lastVerbTemplateId) {
            this.activateMotionPlanForCurrentParts(prompt);
        } else {
            // Try to resolve a default ambient idle motion
            this.activateDefaultMotionPlan();
        }
    }

    /**
     * Try to resolve a verb in the transcript text and store the result.
     * If we have part attributes, activate the motion plan immediately.
     */
    private tryActivateMotionPlan(text: string): void {
        const result = this.tier1Orchestrator.resolveSync(text);
        if (!result || !result.template) return;

        this.lastVerbTemplateId = result.templateId;

        console.log(
            `[SemanticBackend] 🎬 Tier1 verb match: "${result.parsed.verb}" → ` +
            `${result.templateId} (${result.latencyMs.toFixed(1)}ms, source=${result.source})`,
        );

        // Log the motion plan event
        this.sessionLogger?.log('motion', {
            verb: result.parsed.verb,
            templateId: result.templateId,
            source: result.source,
            latencyMs: result.latencyMs,
            adverb: result.parsed.adverb || null,
            overrides: result.overrides,
        });

        // Only activate if we have part data to animate
        if (this.currentPartList && this.currentPartList.length > 0) {
            const plan = parseTemplate(
                result.template,
                this.currentPartList,
                {
                    ...result.overrides,
                    startTime: this.particleSystem.time,
                },
            );

            // Diagnostic: show which per-part motions were matched
            const matchedPartIds = Object.keys(plan.parts).map(Number).filter(id => id > 0);
            console.log(
                `[SemanticBackend] 🔍 Per-part matches: ${matchedPartIds.length}/${this.currentPartList.length} parts matched rules\n` +
                `  Parts available: [${this.currentPartList.map(p => `${p.id}:${p.name}`).join(', ')}]\n` +
                `  Parts with motion: [${matchedPartIds.join(', ')}]\n` +
                `  Template rules: ${result.template.part_rules?.length ?? 0} rules`,
            );

            if (this.motionPlanManager?.isActive) {
                this.motionPlanManager.crossfadeTo(plan, MOTION_CROSSFADE_MS);
            } else {
                this.motionPlanManager?.setMotionPlan(plan);
            }

            console.log(
                `[SemanticBackend] ✨ Motion plan activated: ${result.templateId} ` +
                `(${this.currentPartList.length} parts, speed=${plan.speedScale})`,
            );
        } else {
            console.log(
                `[SemanticBackend] 🎬 Verb matched but no part data yet — ` +
                `will activate when server shape arrives`,
            );
        }
    }

    /**
     * Activate a motion plan using the last resolved verb template
     * and the current part list. Called when server shape arrives
     * and we already have a stored verb template.
     */
    private activateMotionPlanForCurrentParts(prompt: string): void {
        if (!this.lastVerbTemplateId || !this.currentPartList) return;

        const result = this.tier1Orchestrator.resolveSync(prompt);
        const templateId = result?.templateId ?? this.lastVerbTemplateId;
        const template = result?.template ??
            this.tier1Orchestrator.resolveSync(this.lastVerbTemplateId)?.template;

        if (!template) return;

        const plan = parseTemplate(
            template,
            this.currentPartList,
            {
                ...(result?.overrides ?? {}),
                startTime: this.particleSystem.time,
            },
        );

        if (this.motionPlanManager?.isActive) {
            this.motionPlanManager.crossfadeTo(plan, MOTION_CROSSFADE_MS);
        } else {
            this.motionPlanManager?.setMotionPlan(plan);
        }

        console.log(
            `[SemanticBackend] ✨ Motion plan activated (deferred): ${templateId} ` +
            `(${this.currentPartList.length} parts)`,
        );
    }

    /**
     * Activate a default ambient idle motion plan when a server shape
     * arrives but no verb has been spoken yet.
     */
    private activateDefaultMotionPlan(): void {
        if (!this.currentPartList || this.currentPartList.length === 0) return;

        // Try to resolve "idle" as the default template
        const result = this.tier1Orchestrator.resolveSync('idle');
        if (!result || !result.template) return;

        const plan = parseTemplate(
            result.template,
            this.currentPartList,
            { startTime: this.particleSystem.time },
        );

        this.motionPlanManager?.setMotionPlan(plan);
        console.log(
            `[SemanticBackend] 🌿 Default motion plan activated: ambient_idle ` +
            `(${this.currentPartList.length} parts)`,
        );
    }
}
