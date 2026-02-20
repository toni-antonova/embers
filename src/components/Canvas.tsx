import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ParticleSystem } from '../engine/ParticleSystem';
import { AudioEngine } from '../services/AudioEngine';
import { UniformBridge } from '../engine/UniformBridge';
import { UIOverlay } from './UIOverlay';

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

    // Keep AudioEngine as a stable singleton (not affected by canvasKey changes).
    const audioEngineRef = useRef<AudioEngine | null>(null);
    if (!audioEngineRef.current) {
        audioEngineRef.current = new AudioEngine();
    }
    const audioEngine = audioEngineRef.current;

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

        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 10;

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
            particles = new ParticleSystem(renderer, 128);
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
        const uniformBridge = new UniformBridge(audioEngine, particles);
        uniformBridgeRef.current = uniformBridge;

        // ── RESIZE HANDLER ────────────────────────────────────────────────────
        const handleResize = () => {
            camera.aspect = window.innerWidth / window.innerHeight;
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

        // ── ANIMATION LOOP ────────────────────────────────────────────────────
        let lastTime = performance.now();
        const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const targetVec = new THREE.Vector3();

        const animate = () => {
            animationFrameIdRef.current = requestAnimationFrame(animate);

            const now = performance.now();
            const dt = Math.min((now - lastTime) / 1000, 0.1);
            lastTime = now;

            uniformBridgeRef.current?.update();

            if (particleSystemRef.current) {
                if (isPointerActiveRef.current) {
                    raycasterRef.current.setFromCamera(pointerRef.current, camera);
                    raycasterRef.current.ray.intersectPlane(planeZ, targetVec);
                    particleSystemRef.current.setPointer(targetVec, true);
                }
                particleSystemRef.current.update(dt);
            }

            // 1. Motion blur fade: darkens previous frame by a small amount.
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
        // canvasKey change triggers a full teardown + remount with a fresh canvas element.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvasKey]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* key={canvasKey} forces a new <canvas> DOM node on each remount */}
            <canvas
                key={canvasKey}
                ref={canvasRef}
                style={{ display: 'block', width: '100%', height: '100%' }}
            />
            <UIOverlay audioEngine={audioEngine} />
        </div>
    );
}
