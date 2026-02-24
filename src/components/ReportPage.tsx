import './ReportPage.css';

export function ReportPage() {
    return (
        <div className="report-page">
            {/* BACK LINK */}
            <a href="/" className="report-back-link">Back to Embers</a>

            {/* HERO */}
            <header className="report-hero">
                <h2 className="report-hero__title">
                    Building a Speech to Visualization Instrument
                </h2>
                <p className="report-hero__subtitle">
                    A real time system that transforms spoken language into GPU accelerated
                    particle formations, translating what you say and how you say it into
                    a single visual field.
                </p>
                <p className="report-hero__meta">
                    <strong>Toni Antonova</strong> · February 2026
                </p>
            </header>

            {/* Hero video */}
            <div className="report-hero-media">
                <img
                    src="/report-assets/milestone_recording.webp"
                    alt="Embers particles morphing from ring to quadruped shape in response to speech"
                />
            </div>

            {/* BODY */}
            <div className="report-body">

                {/* WHAT I BUILT */}
                <h2>What I Built</h2>

                <p>
                    Embers is a real time speech to visualization system. You speak into your
                    microphone, and <strong>16,384 GPU accelerated particles</strong> respond:
                    morphing into 3D shapes that represent what you said, flowing with physics
                    that reflect <em>how</em> you said it.
                </p>

                <p>
                    The system listens on two channels simultaneously:
                </p>

                <ul>
                    <li><strong>Semantics:</strong> what you're talking about. Entities, actions, concepts (<em>"horse"</em>, <em>"running"</em>, <em>"ocean"</em>)</li>
                    <li><strong>Prosody:</strong> how you're saying it. Energy, tension, urgency, breathiness</li>
                </ul>

                <p>
                    Both channels feed into a single particle field where every parameter is
                    driven by a measurable input. Every mapping is explicit and adjustable.
                    If something moves, you can trace it back to a specific audio feature or
                    semantic classification.
                </p>

                {/* THE CORE INSIGHT */}
                <h2>The Core Insight</h2>

                <p>
                    The critical realization that shaped the whole project: <strong>speech
                        primes the viewer's perception</strong>.
                </p>

                <p>
                    You say the words. The shape confirms the subject. The motion confirms the
                    general quality of the action. The viewer's brain does the compositing.
                    You don't need a running animation. You need
                    the <em>feeling</em> of running: fast, rhythmic, forward, expansive.
                </p>

                <p>
                    So the practical approach is a <strong>three tier verb handling
                        system</strong>: match the verb to a motion template that captures the
                    quality of the action, and let the viewer's perception do the rest.
                    This idea drove every major decision, from how I map emotions to physics,
                    to why I chose particle systems over mesh animation, to the entire
                    architecture of the NLP pipeline.
                </p>

                {/* THE RESEARCH */}
                <h2>The Research</h2>

                <h3>How Emotions Become Particle Physics</h3>

                <p>
                    <strong>Laban Movement Analysis.</strong> Shafir et al. (2016) validated
                    specific movement qualities tied to emotions across 1,241 trials. Four
                    LMA effort dimensions map directly to shader uniforms:
                </p>

                <ul>
                    <li><strong>Weight</strong> (light to strong) maps to particle amplitude</li>
                    <li><strong>Time</strong> (sustained to sudden) maps to acceleration</li>
                    <li><strong>Space</strong> (indirect to direct) maps inversely to turbulence</li>
                    <li><strong>Flow</strong> (bound to free) maps inversely to drag</li>
                </ul>

                <p>
                    These aren't arbitrary aesthetic choices. Joy is low drag + moderate
                    spring + rhythmic bounce. Anger is high spring + high turbulence +
                    minimal drag. Each mapping traces back to experimentally validated
                    movement signatures.
                </p>

                <h3>Color Emotion Research</h3>

                <p>
                    <strong>Valdez &amp; Mehrabian (1994)</strong> showed saturation predicts
                    arousal (r=0.60) and brightness predicts valence (r=0.69).
                    Jonauskaite et al. (2020, N=4,598 across 30 nations) confirmed these
                    hold cross culturally (r=.88). Palmer et al.'s PNAS study found
                    r=0.89 to 0.99 correlation between musical emotion and color choice.
                </p>

                <p>
                    This drove the GPU color system: tension (spectral centroid) controls
                    the warm/cool baseline. Sentiment shifts the gold/blue overlay. Energy
                    boosts brightness. Every color parameter has a citation.
                </p>

                <h3>Crossmodal Correspondences</h3>

                <p>
                    Spence (2011), Marks (1974), Walker et al. (2010): pitch maps to
                    brightness, loudness to size, spectral centroid to color warmth.
                    These hold cross culturally. This validated the core design rule:
                    <strong> one audio feature controls one visual dimension</strong>.
                    No cross contamination. When you see particles swirling faster, you
                    know it's because urgency increased, not because of some opaque
                    feature interaction.
                </p>

                <h3>Emotion to Physics Translation</h3>

                <p>
                    Each detected emotion adjusts the particle physics simultaneously,
                    grounded in the LMA framework:
                </p>

                <div className="emotion-grid">
                    <div className="emotion-card">
                        <div className="emotion-card__emoji">☀️</div>
                        <div className="emotion-card__name">Joy</div>
                        <div className="emotion-card__desc">
                            Spring ↑ · Drag ↓ · Noise ↓<br />
                            Light, bouncy, responsive
                        </div>
                    </div>
                    <div className="emotion-card">
                        <div className="emotion-card__emoji">🌧️</div>
                        <div className="emotion-card__name">Sadness</div>
                        <div className="emotion-card__desc">
                            Spring ↓ · Drag ↑ · Noise ↓<br />
                            Heavy, sluggish, dense
                        </div>
                    </div>
                    <div className="emotion-card">
                        <div className="emotion-card__emoji">🔥</div>
                        <div className="emotion-card__name">Anger</div>
                        <div className="emotion-card__desc">
                            Spring ↑ · Drag ↓ · Noise ↑<br />
                            Aggressive, chaotic, tense
                        </div>
                    </div>
                    <div className="emotion-card">
                        <div className="emotion-card__emoji">💨</div>
                        <div className="emotion-card__name">Fear</div>
                        <div className="emotion-card__desc">
                            Spring ↓ · Drag ↓ · Noise ↑<br />
                            Jittery, unstable, scattered
                        </div>
                    </div>
                </div>

                {/* ARCHITECTURE */}
                <h2>System Architecture</h2>

                <p>
                    The core constraint: <strong>the system must feel instantaneous</strong>.
                    You speak, and particles respond within the span of a breath. This forced
                    a two tier design: a fast local path for the common case, and a server
                    powered path for the long tail.
                </p>

                <h3>Architecture Decisions</h3>

                <p>
                    <strong>Why WebGL2, not WebGPU.</strong> WebGPU is the future, but coverage
                    in February 2026 still has gaps on mobile Safari and older Android WebViews.
                    Since this system needs to run on phones and computers equally, WebGL2 via
                    Three.js GPUComputationRenderer was the pragmatic choice. The architecture
                    is designed for a clean migration path: the GLSL fragment shaders map
                    almost 1:1 to WGSL compute shaders.
                </p>

                <p>
                    <strong>Why particles over mesh animation.</strong> Particles let you
                    represent anything from abstract turbulence to concrete shapes using the
                    same physics engine. There's no rigging, no skeletal animation, no
                    topology constraints. A horse and an ocean use the same 16,384 points,
                    the same five forces, the same shader pipeline. Morphing between them is
                    just reassigning spring targets.
                </p>

                <p>
                    <strong>Why PartCrafter over other 3D models.</strong> The decisive
                    capability was part decomposition: getting labeled mesh parts (head, body,
                    legs) in one forward pass, no fragile segmentation needed. Point-E was too
                    slow (60 to 120s). TripoSR was fast but outputs monolithic meshes.
                    PartCrafter (NeurIPS 2025) generates 2 to 16 pre-decomposed parts in ~0.5s.
                </p>

                <h3>The Two Tier Lookup</h3>

                {/* Architecture diagram */}
                <div className="arch-diagram">
                    <div className="arch-tier arch-tier--client">
                        <div className="arch-tier__badge">Tier 1 · Simple (Client Side)</div>
                        <div className="arch-tier__latency">
                            Response: <strong>&lt;50ms</strong>, covers ~85% of inputs
                        </div>
                        <div className="arch-blocks">
                            <div className="arch-block">
                                <div className="arch-block__name">Verb Hash Table</div>
                                <div className="arch-block__detail">393 verbs · O(1) · &lt;1ms</div>
                            </div>
                            <div className="arch-block">
                                <div className="arch-block__name">MiniLM Embeddings</div>
                                <div className="arch-block__detail">Web Worker · ~10 to 20ms</div>
                            </div>
                            <div className="arch-block">
                                <div className="arch-block__name">Keyword Classifier</div>
                                <div className="arch-block__detail">~160 words · O(1) · &lt;1ms</div>
                            </div>
                        </div>
                    </div>

                    <div className="arch-arrow">↓ If no confident match</div>

                    <div className="arch-tier arch-tier--server">
                        <div className="arch-tier__badge">Tier 2 · Complex (Server Side)</div>
                        <div className="arch-tier__latency">
                            Response: <strong>~2 to 3.5s</strong>, long tail only
                        </div>
                        <div className="arch-blocks">
                            <div className="arch-block">
                                <div className="arch-block__name">SDXL Turbo</div>
                                <div className="arch-block__detail">Text to Image · ~1s</div>
                            </div>
                            <div className="arch-block">
                                <div className="arch-block__name">PartCrafter</div>
                                <div className="arch-block__detail">Image to Parts · ~0.5s</div>
                            </div>
                            <div className="arch-block">
                                <div className="arch-block__name">Cache Layer</div>
                                <div className="arch-block__detail">LRU + GCS · 74% hit rate</div>
                            </div>
                        </div>
                    </div>
                </div>

                <p>
                    The key insight: the server pipeline is an expansion layer, not a
                    necessity. Tier 1 resolves 85% of inputs in under 50ms. You say
                    "horse," the embedding engine matches it to "quadruped," and particles
                    start morphing immediately. The server only fires for the long
                    tail, handling words like "narwhal," "violin," or "submarine."
                </p>

                {/* FULL SYSTEM DIAGRAM */}
                <h3>Full System Diagram</h3>

                <pre><code>{`┌──────────────────────────────────────────────────┐
│                   User Input                      │
│   🎤 Microphone Audio        👆 Mouse/Touch       │
└────────┬─────────────────────────┬────────────────┘
         │                         │
   ┌─────▼─────┐            ┌─────▼─────┐
   │  Audio     │            │  Pointer   │
   │  Engine    │            │  Engine    │
   │ (Meyda +   │            │(Raycaster) │
   │  Pitchy)   │            └─────┬─────┘
   └──┬────┬───┘                   │
      │    │                       │
      │  ┌─▼────────┐             │
      │  │ Speech    │             │
      │  │ Engine    │             │
      │  │(Web Speech│             │
      │  │+ Deepgram │             │
      │  │+ text fb) │             │
      │  └─────┬────┘             │
      │        │                   │
      │  ┌─────▼──────────┐       │
      │  │  Semantic       │       │
      │  │  Classifier     │       │
      │  │ (Verb Hash +    │       │
      │  │  MiniLM +       │       │
      │  │  Server Path)   │       │
      │  └─────┬──────────┘       │
      │        │                   │
      │  ┌─────▼──────────────────▼────┐
      │  │       Uniform Bridge         │
      │  │  (maps all inputs to shader  │
      └──▶   uniforms every frame)      │
         └──────────┬──────────────────┘
                    │
         ┌──────────▼──────────────────┐
         │   GPGPU Particle System     │
         │  (GPUComputationRenderer)   │
         │  128×128 textures · WebGL2  │
         └─────────────────────────────┘`}</code></pre>

                {/* 3D MODEL COMPARISON */}
                <h3>Choosing the 3D Model</h3>

                <table>
                    <thead>
                        <tr>
                            <th>Model</th>
                            <th>Speed</th>
                            <th>Parts</th>
                            <th>Decision</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Point-E (OpenAI)</td>
                            <td>60 to 120s</td>
                            <td>❌ None</td>
                            <td>Too slow</td>
                        </tr>
                        <tr>
                            <td>TripoSR (Stability AI)</td>
                            <td>&lt;0.5s</td>
                            <td>❌ Monolithic</td>
                            <td>No parts</td>
                        </tr>
                        <tr>
                            <td>Hunyuan3D 2 Turbo</td>
                            <td>~1.5s</td>
                            <td>❌ Monolithic</td>
                            <td>Fallback path</td>
                        </tr>
                        <tr>
                            <td><strong>PartCrafter (NeurIPS '25)</strong></td>
                            <td><strong>~0.5s</strong></td>
                            <td><strong>✅ 2 to 16 parts</strong></td>
                            <td><strong>Primary ✓</strong></td>
                        </tr>
                    </tbody>
                </table>

                {/* Quadruped milestone */}
                <div className="report-figure">
                    <img
                        src="/report-assets/milestone_quadruped.png"
                        alt="Particles morphed into a quadruped shape from a spoken word"
                    />
                    <div className="report-figure__caption">
                        Particles converging into a quadruped formation after speaking "horse."
                        Spring forces pull 16,384 particles toward the labeled point cloud.
                    </div>
                </div>

                {/* GPU PARTICLE PHYSICS */}
                <h2>GPU Particle Physics</h2>

                <p>
                    The particle system runs entirely on the GPU via
                    Three.js's <code>GPUComputationRenderer</code>. Two 128×128 floating point
                    textures store position and velocity for all 16,384 particles. Each frame,
                    the GPU reads both textures, computes forces, integrates, and writes
                    back. The CPU never touches individual particle data.
                </p>

                <h3>Five Force Composition</h3>

                <p>
                    Every frame, the velocity shader composes five forces, plus
                    emotion based modulation from the LMA framework:
                </p>

                <pre><code>{`// velocity.frag.glsl (simplified)

// 1. Spring: pull toward morph target
vec3 springForce = uSpringK * (targetPos - pos);

// 2. Curl noise: divergence-free turbulence
vec3 noiseForce = uNoiseAmp * curlNoise(pos * uNoiseFreq + uTime * 0.1);

// 3. Drag: viscosity
vec3 dragForce = -uDrag * vel;

// 4. Repulsion: scatter from cursor/touch
vec3 repulsionForce = computeRepulsion(pos, uPointerWorld, uRepulsionRadius);

// 5. Breathing: sinusoidal expansion/contraction
vec3 breathForce = normalize(pos) * uBreathingAmp * sin(uTime * uBreathingFreq);

vec3 totalForce = springForce + noiseForce + dragForce + repulsionForce + breathForce;
vec3 newVel = vel + totalForce * uDelta;`}</code></pre>

                <p>
                    Why curl noise? It's divergence free (∇·(∇×F) = 0), so particles
                    flow in coherent eddies like fluid rather than scattering like dust. This
                    is what gives the system its "liquid smoke" quality.
                </p>

                <h3>How Movement Gets Animated</h3>

                <p>
                    Rather than animate a mesh skeleton, the system uses <strong>parametric
                        velocity field primitives</strong> inspired by PromptVFX (2025). Each verb
                    maps to a motion template that captures the <em>quality</em> of the action
                    through physics parameters:
                </p>

                <ul>
                    <li><strong>Oscillate:</strong> rhythmic back and forth (breathing, waving, pulsing)</li>
                    <li><strong>Arc:</strong> parabolic trajectories (jumping, throwing, leaping)</li>
                    <li><strong>Rotate:</strong> orbital motion around a center (spinning, circling)</li>
                    <li><strong>Burst:</strong> explosive outward expansion (exploding, scattering)</li>
                    <li><strong>Laminar:</strong> smooth directional flow (running, swimming, flying)</li>
                </ul>

                <p>
                    These primitives compose. "A horse galloping" assigns laminar flow to the
                    legs, oscillation to the body, and a forward bias to the whole form. The
                    verb hash table (393 verbs) maps each verb to the right combination, and
                    adverbs modify intensity: "slowly" reduces speed, "frantically" increases
                    turbulence.
                </p>

                {/* Ring + scatter side-by-side */}
                <div className="report-figure-row">
                    <div>
                        <img
                            src="/report-assets/milestone_ring.png"
                            alt="Particles in ring formation with curl noise"
                        />
                        <div className="report-figure__caption">Idle ring, curl noise only</div>
                    </div>
                    <div>
                        <img
                            src="/report-assets/milestone_scatter.png"
                            alt="Particles in scattered formation during high energy speech"
                        />
                        <div className="report-figure__caption">High energy speech with turbulence activated</div>
                    </div>
                </div>

                {/* AUDIO-TO-VISUAL MAPPING */}
                <h2>Audio to Visual Mapping</h2>

                <p>
                    Meyda extracts psychoacoustic features from the microphone stream in real
                    time. Pitchy adds pitch tracking. Each feature drives exactly one visual
                    dimension, with no cross contamination.
                </p>

                <div className="feature-map">
                    <div className="feature-row">
                        <span>Feature</span>
                        <span>DSP Source</span>
                        <span>Visual Effect</span>
                    </div>
                    <div className="feature-row">
                        <span className="feature-row__name">Energy (RMS)</span>
                        <span className="feature-row__source">Root mean square amplitude</span>
                        <span className="feature-row__effect">Ring expansion + speed</span>
                    </div>
                    <div className="feature-row">
                        <span className="feature-row__name">Tension (Centroid)</span>
                        <span className="feature-row__source">Spectral center of mass</span>
                        <span className="feature-row__effect">Curl noise frequency + warmth</span>
                    </div>
                    <div className="feature-row">
                        <span className="feature-row__name">Urgency (RMS Δ)</span>
                        <span className="feature-row__source">Rate of amplitude change</span>
                        <span className="feature-row__effect">Turbulence / chaos</span>
                    </div>
                    <div className="feature-row">
                        <span className="feature-row__name">Breathiness</span>
                        <span className="feature-row__source">Zero crossing + flatness</span>
                        <span className="feature-row__effect">Drag reduction + Z spread</span>
                    </div>
                    <div className="feature-row">
                        <span className="feature-row__name">Texture (MFCC)</span>
                        <span className="feature-row__source">Cepstral coefficient variance</span>
                        <span className="feature-row__effect">Second noise octave</span>
                    </div>
                    <div className="feature-row">
                        <span className="feature-row__name">Pitch (F0)</span>
                        <span className="feature-row__source">McLeod Pitch Method via Pitchy</span>
                        <span className="feature-row__effect">Spring stiffness modulation</span>
                    </div>
                </div>

                {/* Analysis panel milestone */}
                <div className="report-figure">
                    <img
                        src="/report-assets/milestone_active.png"
                        alt="Analysis panel showing live audio feature bars during speech"
                    />
                    <div className="report-figure__caption">
                        Real time audio features, STT, and semantic classification during live speech.
                    </div>
                </div>

                {/* SPEECH-TO-3D PIPELINE */}
                <h2>Speech to 3D: The Server Pipeline</h2>

                <p>
                    When a concept doesn't match the local shape library, the server
                    generates a labeled 3D point cloud. There are two paths, with automatic fallback:
                </p>

                <pre><code>{`Primary (PartCrafter):
  SDXL Turbo → BG Removal → PartCrafter → Poisson Sampling
    ~1.0s        ~0.1s        ~0.5s         ~20ms
                                        → 2,048 labeled points (~27KB)

Fallback (Hunyuan3D + Grounded SAM):
  SDXL Turbo → BG Removal → Hunyuan3D 2 Turbo → Grounded SAM 2 → Sample
    ~1.0s        ~0.1s           ~1.5s              ~0.3s         ~20ms
                                                        Total: ~3.5s`}</code></pre>

                <h3>The Fallback Mechanism</h3>

                <p>
                    The fallback is a first class path, not an afterthought. If PartCrafter
                    returns fewer than 4 parts (insufficient decomposition for meaningful
                    animation), the system automatically retries via the fallback. Hunyuan3D
                    generates a monolithic mesh, then Grounded SAM 2 segments it into labeled
                    parts using text prompts derived from the original concept.
                </p>

                <p>
                    Both paths output the same format: a base64 encoded array of 2,048
                    positions + part IDs + part names. The client doesn't know or care which
                    pipeline produced the shape. This kept the integration clean and made
                    testing straightforward.
                </p>

                <p>
                    Caching keeps costs low: 74% hit rate across 200 test requests, with
                    memory cache hits resolving in 2.4ms. At 10,000 users per day, projected
                    server cost is $3.90/month.
                </p>

                {/* PRODUCTION DEPLOYMENT */}
                <h2>Production Deployment</h2>

                <p>
                    Deploying to production was the hardest part of this project.
                </p>

                <p>
                    I initially targeted NVIDIA L4 GPUs on Cloud Run, but 24GB VRAM couldn't
                    hold all four models simultaneously. Eager loading (keeping everything in
                    VRAM to avoid cold start latency) requires more memory than the L4 provides.
                </p>

                <p>
                    The solution was the <strong>NVIDIA RTX PRO 6000 Blackwell</strong>. A new
                    GPU available on Cloud Run as of February 2026. 96GB of VRAM, enough to
                    hold all four models with headroom. The container boots, syncs weights from
                    Cloud Storage, loads each model onto the GPU, and won't accept traffic
                    until <code>/health/ready</code> confirms everything is live.
                </p>

                <p>
                    A fun production bug: during load testing, 10 out of 10 parallel requests
                    returned HTTP 500. Two errors surfaced: "Already borrowed" (PyTorch model accessed
                    concurrently) and tensor state corruption. The fix wasn't a mutex; it was
                    setting <code>containerConcurrency: 1</code> in Cloud Run. One GPU, one
                    request at a time. More quota means more containers, not more concurrency.
                </p>

                {/* STT */}
                <h3>Speech Recognition Fallback</h3>

                <p>
                    STT uses a tiered fallback:
                </p>

                <ul>
                    <li><strong>Web Speech API</strong> on Chrome/Edge (free, works well)</li>
                    <li><strong>Deepgram Nova 3</strong> via WebSocket for Safari and iOS (where Web Speech has confirmed bugs through iOS 18)</li>
                    <li><strong>Text input box</strong> if both fail</li>
                </ul>

                <p>
                    The system detects the platform at startup and picks the best available
                    engine. If the primary engine fails mid-session, it falls back silently
                    without interrupting the experience. Speech emotion recognition runs
                    separately via ONNX in the browser (WebGPU first, WASM fallback), so
                    emotion detection works regardless of which STT engine is active.
                </p>

                {/* MILESTONES */}
                <h2>Milestones</h2>

                <ol>
                    <li>GPU particle system with curl noise physics. First particles on screen, idle ring breathing</li>
                    <li>Audio reactivity: psychoacoustic features driving shader uniforms in real time</li>
                    <li>Semantic morphing. Say "horse" and particles converge into a quadruped</li>
                    <li>Emotion driven physics via Laban Movement Analysis. Joy, anger, sadness, fear each feel distinct</li>
                    <li>Server pipeline live: SDXL Turbo + PartCrafter + fallback generating labeled 3D point clouds</li>
                    <li>Production deployment: Firebase Hosting + Cloud Run on RTX PRO 6000 Blackwell</li>
                </ol>

                {/* MILESTONE GALLERY */}
                <h2>Milestone Gallery</h2>

                <div className="report-figure-row">
                    <div>
                        <img
                            src="/report-assets/milestone_wave.png"
                            alt="Particles in wave formation"
                        />
                        <div className="report-figure__caption">Wave formation</div>
                    </div>
                    <div>
                        <img
                            src="/report-assets/milestone_tuning_panel.png"
                            alt="Tuning panel with real time parameter sliders"
                        />
                        <div className="report-figure__caption">Real time physics tuning</div>
                    </div>
                </div>

                <div className="report-figure">
                    <img
                        src="/report-assets/milestone_audio_recording.webp"
                        alt="Audio pipeline milestone recording showing speech to text and audio reactivity"
                    />
                    <div className="report-figure__caption">
                        Audio pipeline: STT + audio reactivity working end to end.
                    </div>
                </div>

                <div className="report-figure-row">
                    <div>
                        <img
                            src="/report-assets/04_audio_reactivity_after.png"
                            alt="Audio reactivity with feature bars"
                        />
                        <div className="report-figure__caption">Audio features responding to speech</div>
                    </div>
                    <div>
                        <img
                            src="/report-assets/06_pipeline_restored.png"
                            alt="Full pipeline restored"
                        />
                        <div className="report-figure__caption">Full pipeline restored after debugging</div>
                    </div>
                </div>

                {/* TECH STACK */}
                <h2>Stack</h2>

                <table>
                    <thead>
                        <tr><th>Layer</th><th>Choice</th><th>Why</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>3D / Particles</td><td>Three.js + GPUComputationRenderer</td><td>16K particles fully GPU computed via WebGL2. No CPU per particle work.</td></tr>
                        <tr><td>Audio</td><td>Meyda + Pitchy</td><td>Psychoacoustic features, not just FFT bins. Plus pitch tracking.</td></tr>
                        <tr><td>NLP</td><td>compromise.js + MiniLM (Transformers.js)</td><td>Sub ms POS tagging + semantic similarity in a Web Worker.</td></tr>
                        <tr><td>STT</td><td>Web Speech API + Deepgram Nova 3</td><td>Browser native primary. WebSocket fallback for Safari.</td></tr>
                        <tr><td>Emotion</td><td>SER via ONNX (WebGPU/WASM)</td><td>Speech emotion recognition in the browser.</td></tr>
                        <tr><td>3D Generation</td><td>SDXL Turbo + PartCrafter</td><td>Text to labeled 3D parts in ~1.5s.</td></tr>
                        <tr><td>Backend</td><td>FastAPI + Python 3.13</td><td>Protocol based interfaces, Pydantic v2 validation.</td></tr>
                        <tr><td>Infra</td><td>Cloud Run + Terraform + Firebase</td><td>RTX PRO 6000 Blackwell GPU. Firebase serves frontend and proxies API.</td></tr>
                        <tr><td>Frontend</td><td>React 19 + TypeScript + Vite</td><td>Strict types. Fast iteration.</td></tr>
                    </tbody>
                </table>

                {/* FUTURE */}
                <h2>What's Next</h2>

                <div className="report-callout report-callout--tbd">
                    <div className="report-callout__label">📊 WebGPU Migration</div>
                    <p style={{ margin: 0 }}>
                        Move particle rendering from WebGL2 fragment shaders to WebGPU compute
                        shaders. The GLSL maps almost 1:1 to WGSL. Payoff: 131K+ particles,
                        proper compute random access, better memory management.
                    </p>
                </div>

                <div className="report-callout report-callout--tbd">
                    <div className="report-callout__label">📊 Better Sentiment</div>
                    <p style={{ margin: 0 }}>
                        AFINN 165 is a lightweight baseline, not a serious affect model.
                        Upgrade path: GoEmotions classifier or a compact model trained on
                        session data.
                    </p>
                </div>

                <div className="report-callout report-callout--tbd">
                    <div className="report-callout__label">📊 Transition Tuning</div>
                    <p style={{ margin: 0 }}>
                        Measure dissolution, mulling, and convergence timing during shape
                        transitions. Quantify overshoot and persistence.
                    </p>
                </div>

                {/* REFERENCES */}
                <h2>Selected References</h2>

                <ol className="report-references">
                    <li>Shafir, T., et al. (2016). Emotion Regulation through Movement. <em>Frontiers in Psychology</em>, 6, 2030.</li>
                    <li>Valdez, P. &amp; Mehrabian, A. (1994). Effects of Color on Emotions. <em>J. Exp. Psych: General</em>, 123(4).</li>
                    <li>Jonauskaite, D., et al. (2020). Universal Patterns in Color Emotion Associations. <em>Psychological Science</em>, 31(10).</li>
                    <li>Palmer, S.E., et al. (2013). Music color associations are mediated by emotion. <em>PNAS</em>, 110(22).</li>
                    <li>Spence, C. (2011). Crossmodal correspondences. <em>Attention, Perception, &amp; Psychophysics</em>, 73.</li>
                    <li>Bridson, R. (SIGGRAPH 2007). Curl noise for procedural fluid motion.</li>
                    <li>PartCrafter (NeurIPS 2025): Part Aware 3D Object Generation.</li>
                    <li>Hunyuan3D 2 (Tencent, 2025): High Resolution 3D Generation.</li>
                    <li>SDXL Turbo (Stability AI): Adversarial Diffusion Distillation.</li>
                    <li>Grounded SAM 2 (Meta): Segment Anything with Grounding.</li>
                </ol>

            </div>

            {/* FOOTER */}
            <footer className="report-footer">
                Built with React 19, Three.js, FastAPI, SDXL Turbo, and PartCrafter.
            </footer>
        </div>
    );
}
