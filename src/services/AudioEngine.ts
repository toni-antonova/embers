import Meyda from 'meyda';

export interface AudioFeatures {
    energy: number;      // smoothed, normalized RMS
    tension: number;     // smoothed, normalized spectralCentroid
    urgency: number;     // smoothed, normalized spectralFlux
    breathiness: number; // smoothed, normalized ZCR / flatness mix
    flatness: number;    // smoothed, normalized spectralFlatness
}

export class AudioEngine {
    audioContext: AudioContext | null = null;
    source: MediaStreamAudioSourceNode | null = null;
    analyzer: any | null = null;

    features: AudioFeatures = {
        energy: 0,
        tension: 0,
        urgency: 0,
        breathiness: 0,
        flatness: 0
    };

    // Smoothing factors
    private alphaRequest = {
        rms: 0.82,
        spectralCentroid: 0.91,
        spectralFlux: 0.72,
        zcr: 0.85,
        spectralFlatness: 0.88
    };

    // Normalization tracking
    private maxRms = 0.01; // Avoid divide by zero

    async start() {
        if (this.audioContext) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.source = this.audioContext.createMediaStreamSource(stream);

            this.analyzer = Meyda.createMeydaAnalyzer({
                audioContext: this.audioContext,
                source: this.source,
                bufferSize: 512,
                // Removed 'spectralFlux' due to browser incompatibility/instability
                featureExtractors: ['rms', 'spectralCentroid', 'zcr', 'spectralFlatness'],
                callback: (features: any) => {
                    this.processFeatures(features);
                }
            });

            this.analyzer.start();
        } catch (e) {
            console.error('AudioEngine start failed:', e);
        }
    }

    stop() {
        if (this.analyzer) {
            this.analyzer.stop();
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
    }

    getFeatures(): AudioFeatures {
        return this.features;
    }

    private processFeatures(raw: any) {
        if (!raw) return;

        // 1. RMS (Energy)
        // Auto-calibrate max RMS to normalize
        const rms = raw.rms || 0;
        if (rms > this.maxRms) {
            this.maxRms = rms;
        } else {
            this.maxRms *= 0.999; // Slow decay of max
        }
        const normRms = Math.min(rms / this.maxRms, 1.0);
        this.features.energy = this.smooth(this.features.energy, normRms, this.alphaRequest.rms);

        // 2. Spectral Centroid (Tension)
        // Range: 0 - Nyquist. Speech usually 500-4000Hz is relevant.
        // Normalize: 0 - 5000Hz approx? bufferSize 512 @ 44.1kHz -> bin width ~86Hz.
        const centroid = raw.spectralCentroid || 0;
        const normCentroid = Math.min(centroid / 100.0, 1.0); // Meyda returns bin index or Hz? Meyda docs say "index of bin". 
        // With 512 buffer -> 256 bins. max index 255. 0-100 is good range.
        this.features.tension = this.smooth(this.features.tension, normCentroid, this.alphaRequest.spectralCentroid);

        // 3. Spectral Flux (Urgency) - DISABLED
        // const flux = raw.spectralFlux || 0;
        // const normFlux = Math.min(flux / 10.0, 1.0); 
        // this.features.urgency = this.smooth(this.features.urgency, normFlux, this.alphaRequest.spectralFlux);
        this.features.urgency = 0; // Temp disable

        // 4. Input ZCR (Breathiness)
        const zcr = raw.zcr || 0;
        // ZCR range is 0 - (buffer/2). 0 - 256.
        const normZcr = Math.min(zcr / 128.0, 1.0);
        this.features.breathiness = this.smooth(this.features.breathiness, normZcr, this.alphaRequest.zcr);

        // 5. Spectral Flatness
        const flatness = raw.spectralFlatness || 0;
        const normFlatness = Math.min(flatness, 1.0);
        this.features.flatness = this.smooth(this.features.flatness, normFlatness, this.alphaRequest.spectralFlatness);
    }

    private smooth(prev: number, curr: number, alpha: number): number {
        return alpha * prev + (1 - alpha) * curr;
    }
}
