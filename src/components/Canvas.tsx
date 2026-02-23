import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { ParticleSystem } from '../engine/ParticleSystem';
import { AudioEngine } from '../services/AudioEngine';
import { SpeechEngine } from '../services/SpeechEngine';
import type { TranscriptEvent } from '../services/SpeechEngine';
import { TuningConfig } from '../services/TuningConfig';
import { UniformBridge } from '../engine/UniformBridge';
import { KeywordClassifier } from '../services/KeywordClassifier';
import { SemanticBackend } from '../services/SemanticBackend';
import type { SemanticEvent } from '../services/SemanticBackend';
import { UIOverlay } from './UIOverlay';
import { TuningPanel } from './TuningPanel';
import type { CameraType, ColorMode } from './TuningPanel';
import { WorkspaceEngine } from '../engine/WorkspaceEngine';
import { AnalysisPanel } from './AnalysisPanel';
import { SessionLogger } from '../services/SessionLogger';
import { ServerClient } from '../services/ServerClient';

export function Canvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const particleSystemRef = useRef<ParticleSystem | null>(null);
    const raycasterRef = useRef(new THREE.Raycaster());
    const pointerRef = useRef(new THREE.Vector2());
    const isPointerActiveRef = useRef(false);
    const animationFrameIdRef = useRef<number>(0);
    const uniformBridgeRef = useRef<UniformBridge | null>(null);

    // Incrementing key forces a fresh <canvas> DOM element on each (re)mount.
    // This sidesteps "existing context of different type" and "precision null"
    // errors that occur when reusing a canvas whose context was just force-lost.
    const [canvasKey, setCanvasKey] = useState(0);

    // Track the active morph target shape — drives the TuningPanel dropdown.
    // This lives in React state (not just ParticleSystem) so the dropdown
    // value stays in sync with what's actually rendering.
    const [currentShape, setCurrentShape] = useState('ring');

    // Track the last speech transcript event so we can display it
    // in the TuningPanel's ghost transcript.
    const [lastTranscript, setLastTranscript] = useState<TranscriptEvent | null>(null);

    // Track the latest semantic event for ghost transcript keyword highlighting.
    const [lastSemanticEvent, setLastSemanticEvent] = useState<SemanticEvent | null>(null);

    // Camera type — perspective (default) or orthographic.
    // Lives in React state so TuningPanel dropdown stays in sync.
    const [cameraType, setCameraType] = useState<CameraType>('orthographic');

    // Color mode — white (default) or color (sentiment-driven).
    // Lives in React state so TuningPanel dropdown stays in sync.
    // Also pushed to UniformBridge.colorMode every frame.
    const [colorMode, setColorMode] = useState<ColorMode>('white');

    // Sentiment-driven color toggle — only active in color mode.
    // When enabled, speech sentiment shifts particle colors warm/cool.
    const [sentimentEnabled, setSentimentEnabled] = useState(false);

    // Sentiment-driven movement toggle — works in any color mode.
    const [sentimentMovementEnabled, setSentimentMovementEnabled] = useState(false);

    // Keep AudioEngine as a stable singleton (not affected by canvasKey changes).
    const audioEngineRef = useRef<AudioEngine | null>(null);
    if (!audioEngineRef.current) {
        audioEngineRef.current = new AudioEngine();
    }
    const audioEngine = audioEngineRef.current;

    // SpeechEngine singleton — transcribes speech to text.
    // Follows the same ref-based singleton pattern as AudioEngine.
    // This is separate from AudioEngine because they serve different
    // purposes: AudioEngine extracts HOW speech sounds (Meyda features),
    // SpeechEngine extracts WHAT is being said (text transcription).
    const speechEngineRef = useRef<SpeechEngine | null>(null);
    if (!speechEngineRef.current) {
        speechEngineRef.current = new SpeechEngine();
    }
    const speechEngine = speechEngineRef.current;

    // TuningConfig singleton — persists across canvas remounts.
    // This is the central config that all systems (ParticleSystem,
    // UniformBridge, AudioEngine, TuningPanel) read from.
    const tuningConfigRef = useRef<TuningConfig | null>(null);
    if (!tuningConfigRef.current) {
        tuningConfigRef.current = new TuningConfig();
    }
    const tuningConfig = tuningConfigRef.current;

    // Wire the config into AudioEngine so it can read smoothing alphas.
    // This uses setConfig() because AudioEngine is created before TuningConfig.
    audioEngine.setConfig(tuningConfig);

    // KeywordClassifier singleton — maps transcript text to semantic states.
    const classifierRef = useRef<KeywordClassifier | null>(null);
    if (!classifierRef.current) {
        classifierRef.current = new KeywordClassifier();
    }
    const classifier = classifierRef.current;

    // WorkspaceEngine singleton — tracks cognitive state.
    const workspaceEngineRef = useRef<WorkspaceEngine | null>(null);
    if (!workspaceEngineRef.current) {
        workspaceEngineRef.current = new WorkspaceEngine();
    }
    const workspaceEngine = workspaceEngineRef.current;

    // SessionLogger singleton — records timestamped events for post-hoc analysis.
    const sessionLoggerRef = useRef<SessionLogger | null>(null);
    if (!sessionLoggerRef.current) {
        sessionLoggerRef.current = new SessionLogger();
    }

    // ServerClient singleton — HTTP client for the Lumen Pipeline server.
    // Reads URL and API key from Vite environment variables.
    const serverClientRef = useRef<ServerClient | null>(null);
    if (!serverClientRef.current) {
        const serverUrl = import.meta.env.VITE_LUMEN_SERVER_URL;
        const apiKey = import.meta.env.VITE_LUMEN_API_KEY || '';
        if (serverUrl) {
            serverClientRef.current = new ServerClient(serverUrl, apiKey);
        }
    }

    // SemanticBackend ref — created inside useEffect after ParticleSystem exists.
    const semanticBackendRef = useRef<SemanticBackend | null>(null);

    // ── SPEECH TRANSCRIPT LOGGING ─────────────────────────────────────────
    // Subscribe to transcript events and log them to the console.
    // This is the initial wiring — later phases will connect transcripts
    // to the KeywordClassifier → morph target pipeline.
    useEffect(() => {
        const unsub = speechEngine.onTranscript((event) => {
            // Log with emoji prefix for easy scanning in dev tools
            const tag = event.isFinal ? '🟢' : '⚪';
            console.log(`${tag} [Canvas] Transcript: "${event.text}" (final=${event.isFinal})`);

            // Store the transcript so it can be displayed in TuningPanel
            setLastTranscript(event);

            // Capture latest semantic event for ghost transcript keyword detection
            if (event.isFinal && semanticBackendRef.current) {
                const log = semanticBackendRef.current.getEventLog();
                if (log.length > 0) {
                    setLastSemanticEvent(log[log.length - 1]);
                }
            }

            // Register speech event in WorkspaceEngine to reset idle state
            if (workspaceEngineRef.current) {
                workspaceEngineRef.current.registerSpeech();
            }
        });
        return unsub;
    }, [speechEngine]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // ── SCENE SETUP ──────────────────────────────────────────────────────
        const scene = new THREE.Scene();

        // Motion blur: orthographic quad rendered before every particle pass.
        const fadeScene = new THREE.Scene();
        const fadeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const fadeMaterial = new THREE.MeshBasicMaterial({
            color: 0x1a1a1a,
            transparent: true,
            opacity: 0.08
        });
        const fadePlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMaterial);
        fadeScene.add(fadePlane);

        // ── CAMERA ────────────────────────────────────────────────────────
        // Create camera based on current type. The initial Z position comes
        // from TuningConfig so it's consistent with the slider default.
        const initialZ = tuningConfig.get('cameraZ');
        const aspect = window.innerWidth / window.innerHeight;

        let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
        if (cameraType === 'orthographic') {
            // Orthographic frustum sized to roughly match perspective FOV at the given Z.
            const frustumHalf = initialZ * Math.tan((75 / 2) * (Math.PI / 180));
            camera = new THREE.OrthographicCamera(
                -frustumHalf * aspect, frustumHalf * aspect,
                frustumHalf, -frustumHalf,
                0.1, 1000
            );
        } else {
            camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
        }
        camera.position.z = initialZ;

        // ── RENDERER ─────────────────────────────────────────────────────────
        let renderer: THREE.WebGLRenderer;
        try {
            renderer = new THREE.WebGLRenderer({
                canvas,
                antialias: true,
                failIfMajorPerformanceCaveat: false
            });
        } catch (e) {
            console.error('WebGL context creation failed — bumping canvas key for recovery:', e);
            setCanvasKey(k => k + 1);
            return;
        }

        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setClearColor(0x1a1a1a);
        // autoClear=false: we manage clearing manually so the fade pass
        // can accumulate motion blur without erasing particles.
        renderer.autoClear = false;

        // ── PARTICLE SYSTEM ───────────────────────────────────────────────────
        let particles: ParticleSystem;
        try {
            // Pass TuningConfig so ParticleSystem can read uniform values each frame.
            particles = new ParticleSystem(renderer, tuningConfig, 128);
        } catch (e) {
            console.error('ParticleSystem init failed — bumping canvas key for recovery:', e);
            renderer.dispose();
            renderer.forceContextLoss();
            setCanvasKey(k => k + 1);
            return;
        }
        scene.add(particles.particles);
        particleSystemRef.current = particles;

        // ── UNIFORM BRIDGE ────────────────────────────────────────────────────
        // Pass TuningConfig so UniformBridge can apply influence multipliers.
        const uniformBridge = new UniformBridge(audioEngine, particles, tuningConfig, workspaceEngine);
        uniformBridgeRef.current = uniformBridge;

        // ── SEMANTIC BACKEND ──────────────────────────────────────────
        // Wires Speech → Classification → Morph pipeline.
        const semanticBackend = new SemanticBackend(
            speechEngine, classifier, particles, uniformBridge,
            sessionLoggerRef.current, serverClientRef.current,
        );
        semanticBackendRef.current = semanticBackend;

        // ── SERVER WARM-UP ────────────────────────────────────────────
        // Wake Cloud Run while user looks at idle particles.
        serverClientRef.current?.warmUp();

        // ── RESIZE HANDLER ────────────────────────────────────────────────────
        const handleResize = () => {
            const newAspect = window.innerWidth / window.innerHeight;
            if (camera instanceof THREE.PerspectiveCamera) {
                camera.aspect = newAspect;
            } else {
                const frustumHalf = camera.position.z * Math.tan((75 / 2) * (Math.PI / 180));
                camera.left = -frustumHalf * newAspect;
                camera.right = frustumHalf * newAspect;
                camera.top = frustumHalf;
                camera.bottom = -frustumHalf;
            }
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            if (particleSystemRef.current) {
                particleSystemRef.current.resize();
            }
        };
        window.addEventListener('resize', handleResize);

        // ── INTERACTION HANDLERS ──────────────────────────────────────────────
        const updatePointer = (clientX: number, clientY: number) => {
            pointerRef.current.x = (clientX / window.innerWidth) * 2 - 1;
            pointerRef.current.y = -(clientY / window.innerHeight) * 2 + 1;
            isPointerActiveRef.current = true;
        };
        const handleMouseMove = (e: MouseEvent) => updatePointer(e.clientX, e.clientY);
        const handleTouchMove = (e: TouchEvent) => {
            if (e.touches.length > 0) updatePointer(e.touches[0].clientX, e.touches[0].clientY);
        };
        const handlePointerLeave = () => {
            isPointerActiveRef.current = false;
            particleSystemRef.current?.setPointer(new THREE.Vector3(9999, 9999, 9999), false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('touchmove', handleTouchMove);
        window.addEventListener('mouseup', handlePointerLeave);
        window.addEventListener('touchend', handlePointerLeave);

        // ── KEYBOARD SHORTCUTS FOR SHAPE CYCLING (DEV TOOL) ───────────────────
        // Press 1-9, 0, -, = to cycle through the 12 morph targets.
        // This is for development/testing — makes it easy to visually verify
        // each shape without needing the semantic pipeline wired up yet.
        const shapeKeys: Record<string, string> = {
            '1': 'ring',
            '2': 'sphere',
            '3': 'quadruped',
            '4': 'humanoid',
            '5': 'scatter',
            '6': 'dual-attract',
            '7': 'wave',
            '8': 'starburst',
            '9': 'tree',
            '0': 'mountain',
            '-': 'building',
            '=': 'bird',
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't intercept if user is typing in an input field
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            const shapeName = shapeKeys[e.key];
            if (shapeName && particleSystemRef.current) {
                particleSystemRef.current.setTarget(shapeName);
                // Sync React state so the TuningPanel dropdown reflects the change.
                setCurrentShape(shapeName);
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        // Expose particle system on window for console debugging:
        // window.__particles.setTarget('wave')
        (window as any).__particles = particles;
        (window as any).__semantic = semanticBackendRef.current;

        // ── ANIMATION LOOP ────────────────────────────────────────────────────
        let lastTime = performance.now();
        const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const targetVec = new THREE.Vector3();

        // Accumulators for periodic session logging
        let logAudioAccum = 0;
        let logWorkspaceAccum = 0;

        const animate = () => {
            animationFrameIdRef.current = requestAnimationFrame(animate);

            const now = performance.now();
            const dt = Math.min((now - lastTime) / 1000, 0.1);
            lastTime = now;

            // ── SESSION LOGGER: periodic audio (200ms) & workspace (500ms) ───
            logAudioAccum += dt;
            logWorkspaceAccum += dt;
            if (logAudioAccum >= 0.2) {
                logAudioAccum = 0;
                const f = audioEngine.getFeatures();
                sessionLoggerRef.current?.log('audio', {
                    energy: f.energy, tension: f.tension, urgency: f.urgency,
                    breathiness: f.breathiness, flatness: f.flatness,
                });
            }
            if (logWorkspaceAccum >= 0.5) {
                logWorkspaceAccum = 0;
                const ws = workspaceEngineRef.current?.getState();
                if (ws) {
                    sessionLoggerRef.current?.log('workspace', {
                        coherence: ws.coherence, entropy: ws.entropy, arousal: ws.arousal,
                        abstractionLevel: ws.abstractionLevel, dominantConcept: ws.dominantConcept,
                        timeSinceLastUtterance: ws.timeSinceLastUtterance,
                    });
                }
            }

            // WorkspaceEngine updates system's cognitive state metrics
            workspaceEngineRef.current?.update(
                dt,
                audioEngine.getFeatures(),
                semanticBackendRef.current?.lastState || null
            );

            // Semantic pipeline runs first — it may set abstraction/noise overrides
            // that UniformBridge needs to apply in the same frame.
            semanticBackendRef.current?.update(dt);
            uniformBridgeRef.current?.update();

            // Update camera Z position from TuningConfig slider.
            const z = tuningConfig.get('cameraZ');
            if (camera.position.z !== z) {
                camera.position.z = z;
                // For orthographic, rescale frustum when Z changes.
                if (camera instanceof THREE.OrthographicCamera) {
                    const fH = z * Math.tan((75 / 2) * (Math.PI / 180));
                    const a = window.innerWidth / window.innerHeight;
                    camera.left = -fH * a;
                    camera.right = fH * a;
                    camera.top = fH;
                    camera.bottom = -fH;
                    camera.updateProjectionMatrix();
                }
            }

            if (particleSystemRef.current) {
                if (isPointerActiveRef.current) {
                    raycasterRef.current.setFromCamera(pointerRef.current, camera);
                    raycasterRef.current.ray.intersectPlane(planeZ, targetVec);
                    particleSystemRef.current.setPointer(targetVec, true);
                }
                particleSystemRef.current.update(dt);
            }

            // 1. Motion blur fade: darkens previous frame by a small amount.
            //    Trail length is controlled by TuningConfig — the fade
            //    material opacity determines how quickly old frames fade out.
            //    Lower opacity = longer trails. Higher opacity = shorter trails.
            fadeMaterial.opacity = tuningConfig.get('trailLength');
            renderer.render(fadeScene, fadeCamera);
            // 2. Clear the depth buffer only — so particles aren't occluded by
            //    the fade quad's depth values (which fill the entire near plane).
            renderer.clearDepth();
            // 3. Render particles on top.
            renderer.render(scene, camera);
        };

        animate();

        // ── CLEANUP ───────────────────────────────────────────────────────────
        return () => {
            cancelAnimationFrame(animationFrameIdRef.current);

            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('touchmove', handleTouchMove);
            window.removeEventListener('mouseup', handlePointerLeave);
            window.removeEventListener('touchend', handlePointerLeave);
            window.removeEventListener('keydown', handleKeyDown);

            // Clean up debug references
            delete (window as any).__particles;
            delete (window as any).__semantic;

            // Dispose semantic backend (unsubscribes from SpeechEngine)
            if (semanticBackendRef.current) {
                semanticBackendRef.current.dispose();
                semanticBackendRef.current = null;
            }

            fadeMaterial.dispose();
            fadePlane.geometry.dispose();

            if (particleSystemRef.current) {
                particleSystemRef.current.dispose();
                particleSystemRef.current = null;
            }

            // forceContextLoss immediately returns the GPU slot to the browser pool,
            // ensuring the next mount (after HMR) can successfully create a new context.
            renderer.dispose();
            renderer.forceContextLoss();
        };
        // canvasKey / cameraType change triggers a full teardown + remount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvasKey, cameraType]);

    // ── SHAPE CHANGE CALLBACKS ────────────────────────────────────────────
    // These bridge the React TuningPanel UI to the imperative ParticleSystem.
    // useCallback ensures referential stability so TuningPanel doesn't re-render
    // unnecessarily.
    const handleShapeChange = useCallback((shapeName: string) => {
        if (particleSystemRef.current) {
            particleSystemRef.current.setTarget(shapeName);
            setCurrentShape(shapeName);
        }
    }, []);

    const handleBlend = useCallback((shapeA: string, shapeB: string, t: number) => {
        if (particleSystemRef.current) {
            particleSystemRef.current.blendTargets(shapeA, shapeB, t);
        }
    }, []);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* key={canvasKey} forces a new <canvas> DOM node on each remount */}
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
                    // Push immediately to UniformBridge so the shader
                    // picks it up on the very next frame.
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
            <AnalysisPanel
                audioEngine={audioEngineRef.current}
                workspaceEngine={workspaceEngineRef.current}
                semanticBackend={semanticBackendRef.current}
                particleSystem={particleSystemRef.current}
                lastTranscript={lastTranscript}
                sessionLogger={sessionLoggerRef.current}
            />
        </div>
    );
}
