import Meyda from 'meyda';
import { PitchDetector } from 'pitchy';
import { TuningConfig } from './TuningConfig';

/**
 * AudioFeatures — The normalized, smoothed output of audio analysis.
 *
 * Each value ranges from 0.0 (none) to 1.0 (maximum). These are fed
 * into the shader pipeline via UniformBridge to control particle behavior.
 */
export interface AudioFeatures {
    energy: number;            // RMS loudness → ring expansion + breathing speed
    tension: number;           // Spectral centroid (brightness) → curl noise tightness + color
    urgency: number;           // Spectral flux (change rate) → noise turbulence/chaos
    breathiness: number;       // ZCR + flatness blend → drag reduction + airiness
    flatness: number;          // Spectral flatness (noise vs tone) → used in breathiness blend
    textureComplexity: number; // MFCC variance → vocal texture richness → noise variation
    rolloff: number;           // Spectral rolloff → voice brightness → particle edge crispness

    // ── PITCH (A1 upgrade — Pitchy F0 extraction) ────────────────
    pitch: number;             // Raw F0 in Hz (0 when no pitch detected)
    pitchDeviation: number;    // Normalized deviation from speaker baseline (-1.0 to +1.0)
    pitchConfidence: number;   // Pitch clarity/confidence (0.0–1.0)
}

/**
 * AudioEngine — Real-time audio feature extraction from microphone input.
 *
 * Uses Meyda (a well-established audio feature extraction library) to
 * analyze the microphone stream in real-time. Meyda runs a Fast Fourier
 * Transform (FFT) on each audio buffer and computes feature descriptors.
 *
 * Each feature is:
 *   1. Extracted from the raw Meyda output
 *   2. Normalized to a [0, 1] range using observed/theoretical ranges
 *   3. Smoothed with an exponential moving average (EMA) to prevent
 *      jittery values from making particles stutter
 *
 * WHY EMA SMOOTHING:
 * Raw audio features oscillate wildly frame-to-frame. EMA creates a
 * "momentum" effect: alpha=0.9 means 90% of the previous value is
 * retained, making movement gradual. Lower alpha = more responsive.
 */
export class AudioEngine {
    audioContext: AudioContext | null = null;
    source: MediaStreamAudioSourceNode | null = null;
    analyzer: any | null = null;

    // Optional reference to TuningConfig — when present, smoothing alphas
    // are read from config each frame instead of from the hardcoded defaults.
    // This enables the TuningPanel to control audio responsiveness in real time.
    private config: TuningConfig | null = null;

    features: AudioFeatures = {
        energy: 0,
        tension: 0,
        urgency: 0,
        breathiness: 0,
        flatness: 0,
        textureComplexity: 0,
        rolloff: 0,
        pitch: 0,
        pitchDeviation: 0,
        pitchConfidence: 0,
    };

    /**
     * Wire up the TuningConfig so smoothing alphas can be adjusted
     * in real time from the TuningPanel. Called once by Canvas.tsx
     * after both AudioEngine and TuningConfig are created.
     */
    setConfig(config: TuningConfig): void {
        this.config = config;
    }

    // ── SMOOTHING FACTORS (EMA alpha) ─────────────────────────────────
    // Higher alpha = smoother/slower response. Lower = snappier/bouncier.
    // For a mic-visualizer feel, we want LOW alphas so the ring reacts
    // instantly to beats, speech, and transients. These are tuned for
    // "bouncy" rather than "smooth and gradual".
    private alphaRequest = {
        rms: 0.55,              // Energy: fast response (was 0.82)
        spectralCentroid: 0.70, // Tension: moderately responsive (was 0.88)
        spectralFlux: 0.35,     // Urgency: near-instant transient response (was 0.65)
        zcr: 0.55,              // ZCR component: fast (was 0.80)
        spectralFlatness: 0.60  // Flatness component: responsive (was 0.85)
    };

    // ── NORMALIZATION TRACKING ─────────────────────────────────────────
    // maxRms auto-calibrates to the loudest sound heard so far.
    // This way, energy is always relative to the user's mic level.
    private maxRms = 0.01; // Start small to avoid divide-by-zero

    // prevRms tracks the previous frame's RMS for computing urgency
    // as a frame-to-frame energy delta (manual spectral flux substitute).
    // We can't use Meyda's spectralFlux — it silently crashes the entire
    // callback in some browser/Meyda version combos, killing ALL features.
    private prevRms = 0;

    // ── PITCH TRACKING STATE (A1 — Pitchy F0) ─────────────────────────
    // The AnalyserNode captures raw time-domain audio in parallel with
    // Meyda's ScriptProcessorNode. Pitchy's McLeod Pitch Method runs on
    // these raw samples to extract the fundamental frequency.
    private pitchAnalyser: AnalyserNode | null = null;
    private pitchBuffer: Float32Array<ArrayBuffer> | null = null;
    private pitchDetector: PitchDetector<Float32Array<ArrayBuffer>> | null = null;
    private pitchBaseline = 0;           // EMA of speaker's typical F0 (Hz)
    private pitchBaselineAlpha = 0.01;   // Slow-moving baseline
    private pitchBaselineInitialized = false;

    // ── DIAGNOSTIC LOGGING ────────────────────────────────────────────
    // Temporary: logs raw feature values every ~1s so the user can see
    // if features are being extracted correctly. Remove after debugging.
    private logCounter = 0;
    private logInterval = 30; // Log every ~30 frames (~0.5s at 60fps)

    async start() {
        if (this.audioContext) return;

        try {
            // ── STEP 1: Get mic access ────────────────────────────────
            console.log('[AudioEngine] Step 1: Requesting mic access...');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('[AudioEngine] Step 1: ✅ Mic stream acquired, tracks:', stream.getAudioTracks().length);

            // ── STEP 2: Create AudioContext ───────────────────────────
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            console.log('[AudioEngine] Step 2: AudioContext created, state:', this.audioContext.state);

            // ── STEP 3: RESUME AudioContext ───────────────────────────
            // CRITICAL: Chrome and most browsers start AudioContext in
            // "suspended" state. It must be explicitly resumed after a
            // user gesture. Without this, Meyda never receives audio
            // buffers and its callback never fires.
            if (this.audioContext.state === 'suspended') {
                console.log('[AudioEngine] Step 3: AudioContext suspended, resuming...');
                await this.audioContext.resume();
            }
            console.log('[AudioEngine] Step 3: ✅ AudioContext state:', this.audioContext.state);

            // ── STEP 4: Connect mic stream to AudioContext ────────────
            this.source = this.audioContext.createMediaStreamSource(stream);
            console.log('[AudioEngine] Step 4: ✅ MediaStreamSource connected');

            // ── STEP 4b: Set up Pitchy AnalyserNode (A1 upgrade) ──────
            // A parallel AnalyserNode captures raw time-domain samples for
            // Pitchy's McLeod Pitch Method. This runs alongside Meyda's
            // ScriptProcessorNode — both read from the same source.
            const pitchFftSize = 2048; // ~46ms at 44.1kHz — good for speech F0
            this.pitchAnalyser = this.audioContext.createAnalyser();
            this.pitchAnalyser.fftSize = pitchFftSize;
            this.source.connect(this.pitchAnalyser);
            this.pitchBuffer = new Float32Array(pitchFftSize) as Float32Array<ArrayBuffer>;
            this.pitchDetector = PitchDetector.forFloat32Array(pitchFftSize);
            console.log('[AudioEngine] Step 4b: ✅ Pitchy AnalyserNode connected (fftSize=%d)', pitchFftSize);

            // ── STEP 5: Create Meyda analyzer ─────────────────────────
            this.analyzer = Meyda.createMeydaAnalyzer({
                audioContext: this.audioContext,
                source: this.source,
                bufferSize: 512,
                // Feature extractors — DO NOT add 'spectralFlux' here!
                // Meyda's spectralFlux silently crashes the ScriptProcessorNode
                // callback in certain browser/version combos, causing ALL
                // features to stop being processed. Urgency is computed
                // manually from RMS deltas instead (see processFeatures).
                featureExtractors: [
                    'rms',
                    'spectralCentroid',
                    'zcr',
                    'spectralFlatness',
                    'mfcc',
                    'spectralRolloff'
                ],
                callback: (features: any) => {
                    this.processFeatures(features);
                }
            });

            // ── STEP 6: Start analyzer ────────────────────────────────
            this.analyzer.start();
            console.log('[AudioEngine] Step 6: ✅ Meyda analyzer started');
            console.log('[AudioEngine] Pipeline ready — [RAW]/[SMOOTH]/[CALIBRATION] logs should appear every ~0.5s');
        } catch (e) {
            console.error('[AudioEngine] ❌ Start failed at some step:', e);
        }
    }

    stop() {
        if (this.analyzer) {
            this.analyzer.stop();
        }
        if (this.pitchAnalyser) {
            this.pitchAnalyser.disconnect();
        }
        if (this.source) {
            this.source.disconnect();
        }
        if (this.audioContext) {
            this.audioContext.close();
        }
        this.audioContext = null;
        this.source = null;
        this.analyzer = null;
        this.pitchAnalyser = null;
        this.pitchBuffer = null;
        this.pitchDetector = null;
        console.log('[AudioEngine] Stopped');
    }

    getFeatures(): AudioFeatures {
        return this.features;
    }

    private processFeatures(raw: any) {
        if (!raw) return;

        // ── 1. RMS → ENERGY (loudness) ────────────────────────────────
        // RMS (Root Mean Square) measures overall signal amplitude.
        // Auto-calibrate: track the loudest RMS seen and normalize against it.
        // maxRms decays slowly so the system adapts if the user gets quieter.
        const rms = raw.rms || 0;
        if (rms > this.maxRms) {
            this.maxRms = rms;
        } else {
            this.maxRms *= 0.998; // Faster decay for quicker sensitivity adaptation (was 0.9995)
        }
        const normRms = Math.min(rms / this.maxRms, 1.0);
        this.features.energy = this.smooth(
            this.features.energy, normRms,
            this.config?.get('audioSmoothing.energy') ?? this.alphaRequest.rms
        );

        // ── 2. SPECTRAL CENTROID → TENSION (brightness/pitch) ─────────
        // Spectral centroid is the "center of mass" of the frequency spectrum.
        // Meyda returns it as a bin index (0 to bufferSize/2 = 256).
        // Speech typically sits in bins 5-50 (430Hz-4300Hz at 44.1kHz/512).
        // Normalizing by 80 maps the typical speech range to ~0.06-0.63.
        const centroid = raw.spectralCentroid || 0;
        const normCentroid = Math.min(centroid / 80.0, 1.0);
        this.features.tension = this.smooth(
            this.features.tension, normCentroid,
            this.config?.get('audioSmoothing.tension') ?? this.alphaRequest.spectralCentroid
        );

        // ── 3. RMS DELTA → URGENCY (rate of loudness change) ──────────
        // We compute urgency as the absolute frame-to-frame change in RMS.
        // This is a manual substitute for spectralFlux, which crashes
        // Meyda's callback in some browsers (see start() comment).
        //
        // High delta = speech onset, consonant burst, sudden volume change
        // Low delta = sustained tone, silence, steady volume
        //
        // The delta is normalized by maxRms so it's relative to the user's
        // mic level. Multiplied by 15.0 to amplify small deltas into the
        // 0-1 range (typical RMS deltas are tiny: 0.001-0.05).
        // Higher multiplier = more sensitive to transients (was 8.0).
        const rmsDelta = Math.abs(rms - this.prevRms);
        this.prevRms = rms;
        const normDelta = Math.min((rmsDelta / this.maxRms) * 15.0, 1.0);
        this.features.urgency = this.smooth(
            this.features.urgency, normDelta,
            this.config?.get('audioSmoothing.urgency') ?? this.alphaRequest.spectralFlux
        );

        // ── 4. ZCR + FLATNESS → BREATHINESS (airy vs tonal) ──────────
        // Zero Crossing Rate (ZCR): counts how often the waveform crosses zero.
        //   - High ZCR = noise-like (breathy, fricatives like "s", "sh")
        //   - Low ZCR = tonal (clean vowels, humming)
        //   - Range: 0 to bufferSize/2 = 256. Speech typically 10-80.
        //
        // Spectral Flatness: measures how noise-like vs tonal the spectrum is.
        //   - 1.0 = white noise (perfectly flat spectrum)
        //   - 0.0 = pure tone (single frequency peak)
        //   - Range: 0 to 1. Speech typically 0.01-0.3.
        //
        // WHY BLEND BOTH: ZCR alone correlates too much with energy/tension
        // because all three rise when you speak louder. By blending in
        // flatness (which measures spectral SHAPE, not amplitude), we get
        // a feature that truly distinguishes breathy from tonal speech.
        const zcr = raw.zcr || 0;
        const normZcr = Math.min(zcr / 100.0, 1.0); // 0-100 range for speech
        const smoothedZcr = this.smooth(
            this.features.breathiness, normZcr,
            this.config?.get('audioSmoothing.breathiness') ?? this.alphaRequest.zcr
        );

        const flatness = raw.spectralFlatness || 0;
        const normFlatness = Math.min(flatness / 0.3, 1.0); // 0-0.3 is typical
        const smoothedFlatness = this.smooth(
            this.features.flatness, normFlatness, this.alphaRequest.spectralFlatness
        );
        this.features.flatness = smoothedFlatness;

        // Blend: 40% ZCR + 60% flatness.
        // Flatness is weighted higher because it's less correlated with
        // energy than ZCR is — it responds to the CHARACTER of the sound
        // rather than just the amplitude.
        this.features.breathiness = smoothedZcr * 0.4 + smoothedFlatness * 0.6;

        // ── 5. MFCCs → TEXTURE COMPLEXITY (vocal richness) ────────────
        // MFCCs (Mel-Frequency Cepstral Coefficients) capture the spectral
        // "shape" of the voice. Computing the VARIANCE of 13 coefficients
        // gives a single number: how texturally complex the sound is.
        // High variance = rich harmonic content (singing, complex vowels)
        // Low variance = simple/flat sound (hums, silence)
        const mfccArray = raw.mfcc as number[] | undefined;
        if (mfccArray && mfccArray.length > 0) {
            const mfccMean = mfccArray.reduce((a: number, b: number) => a + b, 0) / mfccArray.length;
            const mfccVariance = mfccArray.reduce((a: number, b: number) => a + Math.pow(b - mfccMean, 2), 0) / mfccArray.length;
            // Typical variance range is 0-500, map to 0-1
            const normTexture = Math.min(mfccVariance / 300, 1.0);
            this.features.textureComplexity = this.smooth(
                this.features.textureComplexity, normTexture,
                this.config?.get('audioSmoothing.textureComplexity') ?? 0.88
            );
        }

        // ── 6. SPECTRAL ROLLOFF → VOICE BRIGHTNESS ────────────────────
        // Spectral rolloff is the frequency below which 85% of the spectral
        // energy is concentrated. High rolloff = bright/crisp voice,
        // low rolloff = muffled/warm voice.
        // Typical speech range: 1000-8000 Hz.
        const rolloffHz = raw.spectralRolloff || 0;
        const normRolloff = Math.min(Math.max((rolloffHz - 1000) / 7000, 0), 1.0);
        this.features.rolloff = this.smooth(
            this.features.rolloff, normRolloff,
            this.config?.get('audioSmoothing.rolloff') ?? 0.88
        );

        // ── 7. PITCHY F0 → PITCH (A1 upgrade) ────────────────────────
        // Extract pitch from the parallel AnalyserNode's time-domain data.
        // Pitchy's McLeod Pitch Method is fast enough for real-time use
        // (~0.1ms per 2048-sample frame). The baseline EMA tracks the
        // speaker's typical F0 so the deviation is relative.
        this.processPitch();

        // ── DIAGNOSTIC LOGGING (TEMPORARY) ───────────────────────────
        // Three-tier logging to pinpoint exactly where signal drops.
        // Remove this entire block once the pipeline is verified working.
        this.logCounter++;
        if (this.logCounter >= this.logInterval) {
            this.logCounter = 0;
            // Tier 1: Raw Meyda output BEFORE any normalization or smoothing
            console.log(
                `[RAW]  rms:${rms.toFixed(4)} centroid:${centroid.toFixed(1)} ` +
                `rmsDelta:${rmsDelta.toFixed(4)} zcr:${zcr.toFixed(1)} flatness:${flatness.toFixed(4)}`
            );
            // Tier 2: Post-smoothing feature values (what getFeatures() returns)
            console.log(
                `[SMOOTH] energy:${this.features.energy.toFixed(3)} ` +
                `tension:${this.features.tension.toFixed(3)} ` +
                `urgency:${this.features.urgency.toFixed(3)} ` +
                `breath:${this.features.breathiness.toFixed(3)} ` +
                `pitch:${this.features.pitch.toFixed(1)}Hz dev:${this.features.pitchDeviation.toFixed(3)}`
            );
            // Tier 3: Auto-calibration state — if these are NaN/Infinity/0, that's the bug
            console.log(
                `[CALIBRATION] maxRms:${this.maxRms.toFixed(6)} ` +
                `prevRms:${this.prevRms.toFixed(6)} ` +
                `normRms:${normRms.toFixed(3)} normDelta:${normDelta.toFixed(3)} ` +
                `normZcr:${normZcr.toFixed(3)} normFlat:${normFlatness.toFixed(3)} ` +
                `pitchBaseline:${this.pitchBaseline.toFixed(1)}`
            );
        }
    }

    // ── PITCH PROCESSING (A1 upgrade) ─────────────────────────────────

    /**
     * Extract F0 pitch from the AnalyserNode's time-domain data using
     * Pitchy's McLeod Pitch Method. Updates pitch, pitchDeviation, and
     * pitchConfidence in the features object.
     *
     * Called from processFeatures() on every Meyda callback (~86fps
     * at 512-sample buffer / 44.1kHz). The AnalyserNode's data is
     * always available — it captures audio continuously.
     */
    private processPitch(): void {
        if (!this.pitchAnalyser || !this.pitchBuffer || !this.pitchDetector) {
            // Pitch hardware not set up (e.g., before start() or in tests)
            return;
        }

        // Grab the latest time-domain samples from the AnalyserNode
        this.pitchAnalyser.getFloatTimeDomainData(this.pitchBuffer);

        // Run Pitchy's McLeod Pitch Method
        const [pitchHz, clarity] = this.pitchDetector.findPitch(
            this.pitchBuffer,
            this.audioContext!.sampleRate
        );

        // Confidence = Pitchy's clarity value (0.0–1.0)
        const confidence = Math.max(0, Math.min(1, clarity));
        this.features.pitchConfidence = this.smooth(
            this.features.pitchConfidence, confidence, 0.7
        );

        if (confidence >= 0.5 && pitchHz > 50 && pitchHz < 1000) {
            // Valid pitch detected within human speech range (50–1000 Hz)
            this.features.pitch = this.smooth(
                this.features.pitch, pitchHz, 0.6
            );

            // Update baseline EMA (tracks speaker's typical F0)
            if (!this.pitchBaselineInitialized) {
                // First valid pitch — initialize baseline immediately
                this.pitchBaseline = pitchHz;
                this.pitchBaselineInitialized = true;
            } else {
                this.pitchBaseline = this.smooth(
                    this.pitchBaseline, pitchHz, 1 - this.pitchBaselineAlpha
                );
            }

            // Compute normalized deviation: (current - baseline) / baseline
            // Clamped to [-1, +1]
            if (this.pitchBaseline > 0) {
                const rawDeviation = (pitchHz - this.pitchBaseline) / this.pitchBaseline;
                const clampedDeviation = Math.max(-1, Math.min(1, rawDeviation));
                this.features.pitchDeviation = this.smooth(
                    this.features.pitchDeviation, clampedDeviation, 0.6
                );
            }
        } else {
            // No reliable pitch — decay toward zero
            this.features.pitch = this.smooth(this.features.pitch, 0, 0.9);
            this.features.pitchDeviation = this.smooth(
                this.features.pitchDeviation, 0, 0.85
            );
        }
    }

    /**
     * Exponential Moving Average (EMA) smoother.
     *
     * `alpha` controls the balance between stability and responsiveness:
     *   - alpha = 0.9 → very smooth, slow to react (90% old + 10% new)
     *   - alpha = 0.5 → balanced
     *   - alpha = 0.1 → very responsive, almost no smoothing
     */
    private smooth(prev: number, curr: number, alpha: number): number {
        return alpha * prev + (1 - alpha) * curr;
    }
}
