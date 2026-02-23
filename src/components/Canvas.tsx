import { useEffect, useRef, useState, useCallback } from 'react';
import type { TranscriptEvent } from '../services/SpeechEngine';
import { UIOverlay } from './UIOverlay';
import { TuningPanel } from './TuningPanel';
import type { CameraType, ColorMode } from './TuningPanel';
import { AnalysisPanel } from './AnalysisPanel';
import type { SemanticEvent } from '../services/SemanticBackend';
import { useSingletons } from '../hooks/useSingletons';
import { useThreeScene } from '../hooks/useThreeScene';

export function Canvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Incrementing key forces a fresh <canvas> DOM element on each (re)mount.
    // This sidesteps "existing context of different type" and "precision null"
    // errors that occur when reusing a canvas whose context was just force-lost.
    const [canvasKey, setCanvasKey] = useState(0);

    // React state for UI sync
    const [currentShape, setCurrentShape] = useState('ring');
    const [lastTranscript, setLastTranscript] = useState<TranscriptEvent | null>(null);
    const [lastSemanticEvent, setLastSemanticEvent] = useState<SemanticEvent | null>(null);
    const [cameraType, setCameraType] = useState<CameraType>('orthographic');
    const [colorMode, setColorMode] = useState<ColorMode>('white');
    const [sentimentEnabled, setSentimentEnabled] = useState(false);
    const [sentimentMovementEnabled, setSentimentMovementEnabled] = useState(false);

    // Service singletons (persist across canvas remounts)
    const singletons = useSingletons();
    const { audioEngine, speechEngine, tuningConfig, workspaceEngine } = singletons;

    // Three.js scene lifecycle (created/destroyed with canvasKey/cameraType)
    const { particleSystem: particleSystemRef, uniformBridge: uniformBridgeRef, semanticBackend: semanticBackendRef } =
        useThreeScene(canvasRef, canvasKey, setCanvasKey, cameraType, singletons);

    // ── SPEECH TRANSCRIPT LOGGING ─────────────────────────────────────────
    useEffect(() => {
        const unsub = speechEngine.onTranscript((event) => {
            const tag = event.isFinal ? '🟢' : '⚪';
            console.log(`${tag} [Canvas] Transcript: "${event.text}" (final=${event.isFinal})`);

            setLastTranscript(event);

            if (event.isFinal && semanticBackendRef.current) {
                const log = semanticBackendRef.current.getEventLog();
                if (log.length > 0) {
                    setLastSemanticEvent(log[log.length - 1]);
                }
            }

            workspaceEngine?.registerSpeech();
        });
        return unsub;
    }, [speechEngine, workspaceEngine, semanticBackendRef]);

    // ── SHAPE CHANGE CALLBACKS ────────────────────────────────────────────
    const handleShapeChange = useCallback((shapeName: string) => {
        if (particleSystemRef.current) {
            particleSystemRef.current.setTarget(shapeName);
            setCurrentShape(shapeName);
        }
    }, [particleSystemRef]);

    const handleBlend = useCallback((shapeA: string, shapeB: string, t: number) => {
        if (particleSystemRef.current) {
            particleSystemRef.current.blendTargets(shapeA, shapeB, t);
        }
    }, [particleSystemRef]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <canvas
                key={canvasKey}
                ref={canvasRef}
                style={{ display: 'block', width: '100%', height: '100%' }}
            />
            <UIOverlay audioEngine={audioEngine} speechEngine={speechEngine} />
            <TuningPanel
                config={tuningConfig}
                audioEngine={audioEngine}
                currentShape={currentShape}
                onShapeChange={handleShapeChange}
                onBlend={handleBlend}
                cameraType={cameraType}
                onCameraTypeChange={setCameraType}
                colorMode={colorMode}
                onColorModeChange={(mode: ColorMode) => {
                    setColorMode(mode);
                    if (uniformBridgeRef.current) {
                        uniformBridgeRef.current.colorMode = mode;
                    }
                }}
                sentimentEnabled={sentimentEnabled}
                onSentimentToggle={(enabled: boolean) => {
                    setSentimentEnabled(enabled);
                    if (uniformBridgeRef.current) {
                        uniformBridgeRef.current.sentimentEnabled = enabled;
                    }
                }}
                sentimentMovementEnabled={sentimentMovementEnabled}
                onSentimentMovementToggle={(enabled: boolean) => {
                    setSentimentMovementEnabled(enabled);
                    if (uniformBridgeRef.current) {
                        uniformBridgeRef.current.sentimentMovementEnabled = enabled;
                    }
                }}
                transcript={lastTranscript}
                lastSemanticEvent={lastSemanticEvent}
                onIdleReset={() => {
                    if (uniformBridgeRef.current) {
                        uniformBridgeRef.current.resetToIdle();
                    }
                }}
            />
            {/* AnalysisPanel uses direct DOM manipulation for 60fps — not React re-renders.
                Reading refs here is intentional: these values drive imperative updates. */}
            <AnalysisPanel
                audioEngine={audioEngine}
                workspaceEngine={workspaceEngine}
                semanticBackend={semanticBackendRef.current}  /* eslint-disable-line react-hooks/refs */
                particleSystem={particleSystemRef.current}  /* eslint-disable-line react-hooks/refs */
                lastTranscript={lastTranscript}
                sessionLogger={singletons.sessionLogger}
            />
        </div>
    );
}
