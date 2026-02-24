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

                {/* THE CORE MOTIVATION */}
                <h2>The Core Motivation</h2>

                <p>
                    The driving idea behind the whole project: <strong>speech
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
                        system</strong> - match the verb to a motion template that captures the
                    quality of the action, and let the viewer's perception do the rest.
                    This idea drove every major decision, from how I map emotions to physics,
                    to why I chose particle systems over mesh animation, to the entire
                    architecture of the NLP pipeline.
                </p>

                {/* THE RESEARCH */}
                <h2>The Research</h2>

                <p>
                    Three bodies of research ground the visual mappings: <strong>Laban
                        Movement Analysis</strong> connects emotions to movement qualities,
                    <strong>color-emotion studies</strong> connect affect to hue and
                    brightness, and <strong>crossmodal correspondence</strong> research
                    validates that pitch, loudness, and timbre map to specific visual
                    dimensions. Each one gave a concrete rule for the shader system.
                </p>

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
                    These hold cross culturally. This validated the core design rule -
                    <strong> one audio feature controls one visual dimension</strong>.
                    No cross contamination. When you see particles swirling faster, you
                    know it's because urgency increased, not because of some opaque
                    feature interaction.
                </p>

                <h3>Emotion to Physics Translation</h3>

                <p>
                    Combining all three research areas, each detected emotion maps to a
                    distinct physics profile. The SER model classifies the speaker's
                    emotion, the LMA framework translates it into movement qualities,
                    and the shader applies the corresponding forces. Here's what each
                    emotion looks like in practice:
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

                <table>
                    <thead>
                        <tr><th>Component</th><th>Technology</th><th>Notes</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>Particle rendering &amp; simulation</td><td>WebGL2 (Three.js GPUComputationRenderer)</td><td>GLSL fragment shaders</td></tr>
                        <tr><td>SER model inference</td><td>WebGPU → WASM fallback (ONNX Runtime)</td><td>Not rendering, just ML inference</td></tr>
                    </tbody>
                </table>

                <p>
                    The statement holds for the core rendering and simulation pipeline. WebGL2
                    via Three.js powers the entire visual system, the pragmatic cross device
                    choice. The only place WebGPU appears is as an optional accelerator for
                    ONNX inference in the speech emotion recognition worker, with a graceful
                    WASM fallback, exactly proving the point about coverage gaps.
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
                                <div className="arch-block__name">PartCrafter (Primary)</div>
                                <div className="arch-block__detail">Image to Parts · ~0.5s · 2 to 16 labeled parts</div>
                            </div>
                        </div>
                        <div className="arch-arrow">↓ If &lt;4 parts returned</div>
                        <div className="arch-blocks">
                            <div className="arch-block">
                                <div className="arch-block__name">Hunyuan3D 2 Turbo (Fallback)</div>
                                <div className="arch-block__detail">Image to Mesh · ~1.5s</div>
                            </div>
                            <div className="arch-block">
                                <div className="arch-block__name">Grounded SAM 2</div>
                                <div className="arch-block__detail">Mesh Segmentation · ~0.3s</div>
                            </div>
                        </div>
                        <div className="arch-blocks">
                            <div className="arch-block">
                                <div className="arch-block__name">Cache Layer</div>
                                <div className="arch-block__detail">LRU + GCS · 74% hit rate</div>
                            </div>
                        </div>
                    </div>
                </div>

                <p>
                    The server tier has two internal paths, primary and fallback, that are
                    invisible to the client. PartCrafter is the primary path because it
                    outputs pre-decomposed parts in a single forward pass, no post-processing
                    segmentation needed. If it returns fewer than 4 parts (insufficient
                    decomposition for meaningful animation), the server automatically retries
                    via Hunyuan3D 2 Turbo + Grounded SAM 2. Hunyuan3D was chosen for its
                    high resolution mesh quality. Grounded SAM 2 was chosen because it can
                    segment the monolithic mesh into labeled parts using text prompts derived
                    from the original concept. Both paths output the same format, so the
                    client never knows which pipeline produced the shape.
                </p>

                <p>
                    The key insight: the server pipeline is an expansion layer, not a
                    necessity. Tier 1 resolves 85% of inputs in under 50ms. You say
                    "horse," the embedding engine matches it to "quadruped," and particles
                    start morphing immediately. The server only fires for the long
                    tail, handling words like "narwhal," "violin," or "submarine."
                </p>

                <p>
                    The system gets smarter over time. Every server generated shape is
                    cached at two levels: an in memory LRU for instant repeat lookups
                    (2.4ms), and persistent Cloud Storage for cross session hits. As more
                    users interact, the cache fills with real world vocabulary, shifting
                    more and more requests from the 2 to 3s server path into sub-50ms
                    cache hits. The long tail shrinks with use.
                </p>

                {/* FULL SYSTEM DIAGRAM */}
                <h3>Full System Diagram</h3>

                <div className="sys-diagram">
                    {/* User Input */}
                    <div className="sys-node sys-node--input">
                        <div className="sys-node__label">User Input</div>
                        <div className="sys-node__row">
                            <span>🎤 Microphone Audio</span>
                            <span>👆 Mouse / Touch</span>
                        </div>
                    </div>

                    <div className="sys-diagram__fork">
                        <div className="sys-branch">
                            <div className="sys-arrow">↓</div>

                            {/* Audio Engine */}
                            <div className="sys-node sys-node--process">
                                <div className="sys-node__label">Audio Engine</div>
                                <div className="sys-node__detail">Meyda + Pitchy</div>
                                <div className="sys-node__meta">RMS · Centroid · ZCR · MFCC · F0</div>
                            </div>

                            <div className="sys-arrow">↓</div>

                            {/* SER + Speech side by side */}
                            <div className="sys-node__pair">
                                <div className="sys-node sys-node--accent">
                                    <div className="sys-node__label">SER Worker</div>
                                    <div className="sys-node__detail">ONNX Runtime</div>
                                    <div className="sys-node__meta">WebGPU → WASM fallback</div>
                                    <div className="sys-node__meta">joy · anger · sad · fear → LMA</div>
                                </div>
                                <div className="sys-node sys-node--process">
                                    <div className="sys-node__label">Speech Engine</div>
                                    <div className="sys-node__meta">① Web Speech API</div>
                                    <div className="sys-node__meta">② Deepgram Nova 3</div>
                                    <div className="sys-node__meta">③ Text input box</div>
                                </div>
                            </div>

                            <div className="sys-arrow">↓</div>

                            {/* Semantic Classifier */}
                            <div className="sys-node sys-node--green">
                                <div className="sys-node__badge">Tier 1 · Client</div>
                                <div className="sys-node__label">Semantic Classifier</div>
                                <div className="sys-node__meta">Verb Hash · 393 verbs</div>
                                <div className="sys-node__meta">MiniLM · Web Worker</div>
                                <div className="sys-node__meta">Keyword · ~160 words</div>
                            </div>

                            <div className="sys-arrow sys-arrow--conditional">↓ no match</div>

                            {/* Server Pipeline */}
                            <div className="sys-node sys-node--blue">
                                <div className="sys-node__badge">Tier 2 · Server</div>
                                <div className="sys-node__label">Server Pipeline</div>
                                <div className="sys-node__inner-row">
                                    <div className="sys-node--sub">
                                        <div className="sys-node__detail">Cache</div>
                                        <div className="sys-node__meta">LRU 2.4ms · GCS persist</div>
                                    </div>
                                    <div className="sys-node--sub">
                                        <div className="sys-node__detail">SDXL Turbo</div>
                                        <div className="sys-node__meta">Text → Image ~1s</div>
                                    </div>
                                </div>
                                <div className="sys-arrow sys-arrow--inner">↓</div>
                                <div className="sys-node__inner-row">
                                    <div className="sys-node--sub sys-node--sub-primary">
                                        <div className="sys-node__detail">PartCrafter</div>
                                        <div className="sys-node__meta">~0.5s · 2–16 parts</div>
                                    </div>
                                    <div className="sys-node--sub sys-node--sub-fallback">
                                        <div className="sys-node__detail">Hunyuan3D + SAM 2</div>
                                        <div className="sys-node__meta">~1.8s · fallback</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="sys-branch sys-branch--pointer">
                            <div className="sys-arrow">↓</div>
                            <div className="sys-node sys-node--process">
                                <div className="sys-node__label">Pointer Engine</div>
                                <div className="sys-node__detail">Raycaster</div>
                            </div>
                        </div>
                    </div>

                    <div className="sys-arrow sys-arrow--merge">↓ all inputs converge</div>

                    {/* Uniform Bridge */}
                    <div className="sys-node sys-node--bridge">
                        <div className="sys-node__label">Uniform Bridge</div>
                        <div className="sys-node__meta">Maps all inputs → shader uniforms every frame</div>
                    </div>

                    <div className="sys-arrow">↓</div>

                    {/* GPU Particle System */}
                    <div className="sys-node sys-node--gpu">
                        <div className="sys-node__label">GPGPU Particle System</div>
                        <div className="sys-node__detail">GPUComputationRenderer</div>
                        <div className="sys-node__meta">128×128 textures · 16,384 particles · 5 forces · WebGL2 · GLSL</div>
                    </div>
                </div>

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
                    The current solution is the <strong>NVIDIA RTX PRO 6000 Blackwell</strong>,
                    a new GPU available on Cloud Run as of February 2026. 96GB of VRAM, enough
                    to hold all four models with headroom. The container boots, syncs weights
                    from Cloud Storage, loads each model onto the GPU, and won't accept traffic
                    until <code>/health/ready</code> confirms everything is live.
                    This is a <strong>temporary architecture</strong>. The immediate next step
                    is moving to a cheaper GPU tier by pre-baking model weights into the base
                    image and loading only the primary model at startup, with fallbacks loaded
                    on demand.
                </p>

                <p>
                    A fun production bug: during load testing, 10 out of 10 parallel requests
                    returned HTTP 500. Two errors surfaced: "Already borrowed" (PyTorch model accessed
                    concurrently) and tensor state corruption. The fix wasn't a mutex; it was
                    setting <code>containerConcurrency: 1</code> in Cloud Run. One GPU, one
                    request at a time. More quota means more containers, not more concurrency.
                </p>

                <h3>The Deployment Pipeline</h3>

                <p>
                    With GPU containers, every iteration is expensive. Docker builds take
                    30+ minutes. Model weight downloads add another 10 to 15 minutes on
                    cold starts. A single typo in a dependency can cost an hour.
                </p>

                <p>
                    To manage this, I structured a <strong>two stage build</strong> via
                    Cloud Build. The first stage (<code>Dockerfile.base</code>) installs
                    system dependencies, CUDA libraries, PyTorch, and all heavy Python
                    packages into a cached base image. This rarely changes. The second
                    stage (<code>Dockerfile</code>) layers the application code on top,
                    which takes under two minutes. Model weights are synced from Cloud
                    Storage at container startup rather than baked into the image, keeping
                    the image size manageable and the push/pull fast.
                </p>

                <p>
                    The result is a CI/CD-like flow without a full CI system:
                    <code>cloudbuild.yaml</code> defines the build,
                    <code>gcloud builds submit</code> pushes it, and Cloud Run rolls
                    the new revision with zero downtime. When something breaks in
                    production, I can roll back to the previous revision in under a
                    minute.
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
                        <tr><td>STT</td><td>Web Speech API → Deepgram Nova 3 → Text input</td><td>Three tier fallback. Browser native primary, WebSocket for Safari, text box last resort.</td></tr>
                        <tr><td>Emotion</td><td>SER via ONNX (WebGPU → WASM)</td><td>Speech emotion recognition in the browser with graceful fallback.</td></tr>
                        <tr><td>Sentiment</td><td>AFINN-165</td><td>Lightweight lexicon based valence scoring. Upgrade path planned.</td></tr>
                        <tr><td>3D Primary</td><td>SDXL Turbo + PartCrafter</td><td>Text to labeled 3D parts in ~1.5s. Pre-decomposed, no segmentation needed.</td></tr>
                        <tr><td>3D Fallback</td><td>Hunyuan3D 2 Turbo + Grounded SAM 2</td><td>High resolution mesh + text prompted segmentation. Fires when PartCrafter returns &lt;4 parts.</td></tr>
                        <tr><td>Caching</td><td>LRU (in memory) + Cloud Storage</td><td>74% hit rate. Memory hits in 2.4ms. Long tail shrinks with use.</td></tr>
                        <tr><td>Backend</td><td>FastAPI + Python 3.13</td><td>Protocol based interfaces, Pydantic v2 validation.</td></tr>
                        <tr><td>Infra</td><td>Cloud Run + Terraform + Firebase</td><td>RTX PRO 6000 Blackwell GPU. Two stage Docker build. Cloud Build CI.</td></tr>
                        <tr><td>Frontend</td><td>React 19 + TypeScript + Vite</td><td>Strict types. Fast iteration.</td></tr>
                    </tbody>
                </table>

                {/* FUTURE */}
                <h2>What's Next</h2>

                <div className="report-callout report-callout--tbd">
                    <div className="report-callout__label">📊 Cheaper Deployment</div>
                    <p style={{ margin: 0 }}>
                        Move from the RTX PRO 6000 to a cheaper GPU tier. Pre-bake model
                        weights into the base Docker image, load only the primary model
                        (PartCrafter) at startup, and lazy-load fallbacks on demand.
                        Target: L4 or T4 class GPU at a fraction of the current cost.
                    </p>
                </div>

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
