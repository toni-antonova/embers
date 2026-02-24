import './ReportPage.css';

export function ReportPage() {
    return (
        <div className="report-page">
            {/* ── BACK LINK ──────────────────────────────────────────────── */}
            <a href="/" className="report-back-link">← Back to Zen Swarm</a>

            {/* ═══════════════════════════════════════════════════════════════
       * HERO
       * ═══════════════════════════════════════════════════════════════ */}
            <header className="report-hero">
                <p className="report-hero__kicker">Challenge Option 4 · Speech-to-Visualization</p>
                <h1 className="report-hero__title">
                    Zen Swarm: Building a Speech‑to‑Visualization Instrument for Consciousness Research
                </h1>
                <p className="report-hero__subtitle">
                    A technical narrative on designing and engineering a real-time system that transforms
                    spoken language into GPU-accelerated particle formations — framed as an instrument
                    for operationalizing theories of machine consciousness.
                </p>
                <p className="report-hero__meta">
                    <strong>Toni Antonova</strong> · February 2026
                </p>
            </header>

            {/* Hero video */}
            <div className="report-hero-media">
                <img
                    src="/report-assets/milestone_recording.webp"
                    alt="Zen Swarm particles morphing from ring to quadruped shape in response to speech"
                />
            </div>

            {/* ═══════════════════════════════════════════════════════════════
       * BODY
       * ═══════════════════════════════════════════════════════════════ */}
            <div className="report-body">

                {/* ── TL;DR ──────────────────────────────────────────────── */}
                <h2>What I Built — and Why</h2>

                <p>
                    Zen Swarm is a real-time speech-to-visualization system. You speak into your
                    microphone, and <strong>16,384 GPU-accelerated particles</strong> respond — morphing into
                    3D shapes that represent what you said, flowing with physics that reflect <em>how</em> you
                    said it. The system extracts two concurrent channels from speech:
                </p>

                <ul>
                    <li><strong>Semantics</strong> — entities, actions, concepts (<em>"horse"</em>, <em>"running"</em>, <em>"ocean"</em>)</li>
                    <li><strong>Prosody</strong> — arousal, tension, urgency, breathiness (<em>how</em> it's said)</li>
                </ul>

                <p>
                    These channels drive a single, inspectable visual field: a particle system whose
                    parameters are derived from measurable inputs and whose internal state (coherence,
                    arousal, entropy) is <strong>explicit, tunable, and logged</strong>. The mapping is
                    configurable via <strong>theory lenses</strong> — parameterized assumptions inspired
                    by Global Workspace Theory, Attention Schema Theory, and integration proxies — so
                    the system's behavior is inspectable rather than a black box.
                </p>

                <div className="report-callout report-callout--insight">
                    <div className="report-callout__label">💡 Key Insight</div>
                    <p style={{ margin: 0 }}>
                        I read Option 4 not as an invitation to build a generative art demo, but as an
                        opportunity to build a <strong>research instrument</strong> — a test harness where
                        representational assumptions about consciousness can be implemented, manipulated,
                        logged, and compared.
                    </p>
                </div>

                {/* ── PERFORMANCE CARDS ───────────────────────────────────── */}
                <div className="perf-grid">
                    <div className="perf-card">
                        <div className="perf-card__value">16,384</div>
                        <div className="perf-card__label">GPU Particles</div>
                    </div>
                    <div className="perf-card">
                        <div className="perf-card__value">110+ FPS</div>
                        <div className="perf-card__label">MacBook Pro M-series</div>
                    </div>
                    <div className="perf-card">
                        <div className="perf-card__value">&lt;50ms</div>
                        <div className="perf-card__label">Semantic Response (Tier 1)</div>
                    </div>
                    <div className="perf-card">
                        <div className="perf-card__value">522</div>
                        <div className="perf-card__label">Tests Passing</div>
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════
         * SECTION: THE RESEARCH FOUNDATION
         * ═══════════════════════════════════════════════════════════ */}
                <h2>The Research Foundation</h2>

                <p>
                    This project didn't start with code — it started with deciding what would count
                    as a <strong>meaningful mapping</strong>. The prompt asks for sentiment, rhythm,
                    emphasis. "Meaningful" can mean "looks cool," but I treated it as "grounded enough
                    that mappings are defensible, testable, and adjustable." Over 100 papers across
                    emotion psychology, movement science, computational vision, and motion synthesis
                    informed the design.
                </p>

                <h3>How Emotions Become Particle Physics</h3>

                <p>
                    I anchored the mapping in three intersecting bodies of research:
                </p>

                <p>
                    <strong>Laban Movement Analysis (LMA)</strong> — Shafir et al. (2016) experimentally
                    validated specific movement qualities across 1,241 trials. Weight (light→strong)
                    maps to amplitude. Time (sustained→sudden) maps to acceleration. Space (indirect→direct)
                    maps inversely to turbulence. Flow (bound→free) maps inversely to drag. These aren't
                    vibes — they're experimentally validated movement signatures translated into shader
                    uniforms.
                </p>

                <p>
                    <strong>Color-emotion research</strong> — Valdez &amp; Mehrabian (1994) showed saturation
                    is the strongest predictor of arousal (r=0.60) and brightness for valence (r=0.69).
                    Jonauskaite et al. (2020, N=4,598 across 30 nations) confirmed near-universal
                    color-emotion associations (r=.88). Every color parameter has a citation.
                </p>

                <p>
                    <strong>Crossmodal correspondences</strong> — Spence (2011), Marks (1974), Walker et al.
                    (2010) established that pitch→brightness, loudness→visual size, and spectral
                    centroid→color warmth are cross-culturally robust. This validated the core design
                    principle:
                </p>

                <blockquote>
                    <strong>One audio feature → one visual dimension.</strong> No cross-contamination. Energy
                    doesn't affect color. Tension doesn't affect size. When particles swirl faster, you
                    know it's because urgency increased — not some opaque feature interaction.
                    Inspectability is a core requirement for a research instrument.
                </blockquote>

                <h3>Emotion → Physics Translation</h3>

                <p>
                    Each emotion profile adjusts five physics parameters simultaneously, drawing on
                    the LMA framework:
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

                {/* ═══════════════════════════════════════════════════════════
         * SECTION: ARCHITECTURE
         * ═══════════════════════════════════════════════════════════ */}
                <h2>System Architecture: Decisions Under Constraint</h2>

                <p>
                    I treated this like a platform problem: define the latency budget, define failure
                    modes, build the fast path first, and make the long-tail path optional. The core
                    constraint: <strong>the system must feel instantaneous</strong>. A person speaks,
                    and the visualization must respond within the span of a breath.
                </p>

                <h3>The Two-Tier Lookup System</h3>

                <p>
                    This is the architectural decision I'm most proud of, because it emerged from
                    understanding the latency budget:
                </p>

                {/* Architecture diagram */}
                <div className="arch-diagram">
                    <div className="arch-tier arch-tier--client">
                        <div className="arch-tier__badge">Tier 1 · Client-Side</div>
                        <div className="arch-tier__latency">
                            Response: <strong>&lt;50ms</strong> — covers ~85% of inputs
                        </div>
                        <div className="arch-blocks">
                            <div className="arch-block">
                                <div className="arch-block__name">Verb Hash Table</div>
                                <div className="arch-block__detail">393 verbs · O(1) · &lt;1ms</div>
                            </div>
                            <div className="arch-block">
                                <div className="arch-block__name">MiniLM Embeddings</div>
                                <div className="arch-block__detail">Web Worker · ~10-20ms</div>
                            </div>
                            <div className="arch-block">
                                <div className="arch-block__name">Keyword Classifier</div>
                                <div className="arch-block__detail">~160 words · O(1) · &lt;1ms</div>
                            </div>
                        </div>
                    </div>

                    <div className="arch-arrow">↓ If no confident match</div>

                    <div className="arch-tier arch-tier--server">
                        <div className="arch-tier__badge">Tier 2 · Server-Side</div>
                        <div className="arch-tier__latency">
                            Response: <strong>~2–3.5s</strong> — long-tail only
                        </div>
                        <div className="arch-blocks">
                            <div className="arch-block">
                                <div className="arch-block__name">SDXL Turbo</div>
                                <div className="arch-block__detail">Text→Image · ~1s</div>
                            </div>
                            <div className="arch-block">
                                <div className="arch-block__name">PartCrafter</div>
                                <div className="arch-block__detail">Image→Parts · ~0.5s</div>
                            </div>
                            <div className="arch-block">
                                <div className="arch-block__name">Cache Layer</div>
                                <div className="arch-block__detail">LRU + GCS · 74% hit rate</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="report-callout report-callout--decision">
                    <div className="report-callout__label">🧭 Architecture Decision</div>
                    <p style={{ margin: 0 }}>
                        Tier 1 is the product. The server pipeline is an <strong>expansion layer</strong>,
                        not a necessity. The existing 12 procedural shapes + embedding similarity handle
                        most common concepts. This reframing changed the engineering priority: embedding
                        engine first, server pipeline second.
                    </p>
                </div>

                <h3>Choosing the 3D Generation Model</h3>

                <p>
                    The server pipeline required choosing from a rapidly evolving landscape of text-to-3D
                    models. The decisive capability was <strong>part decomposition</strong>: getting
                    pre-labeled mesh parts (head, body, legs, tail) in one forward pass, without a
                    fragile segmentation stage.
                </p>

                <table>
                    <thead>
                        <tr>
                            <th>Model</th>
                            <th>Speed</th>
                            <th>Part Decomposition</th>
                            <th>Decision</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Point-E (OpenAI)</td>
                            <td>60–120s</td>
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
                            <td>Hunyuan3D-2 Turbo</td>
                            <td>~1.5s</td>
                            <td>❌ Monolithic</td>
                            <td>Fallback path</td>
                        </tr>
                        <tr>
                            <td><strong>PartCrafter (NeurIPS '25)</strong></td>
                            <td><strong>~0.5s</strong></td>
                            <td><strong>✅ 2–16 parts</strong></td>
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
                        Particles converging into a quadruped formation after speaking "horse" —
                        spring forces pull 16,384 particles toward the labeled point cloud.
                    </div>
                </div>

                <h3>Technology Choices</h3>

                <table>
                    <thead>
                        <tr><th>Layer</th><th>Choice</th><th>Rationale</th></tr>
                    </thead>
                    <tbody>
                        <tr><td>Frontend</td><td>React 19 + TypeScript 5.9 + Vite 7.3</td><td>Current best-in-class. Strict types catch bugs at compile time.</td></tr>
                        <tr><td>3D Rendering</td><td>Three.js + GPUComputationRenderer</td><td>16K particles fully GPU-computed; no CPU per-particle work.</td></tr>
                        <tr><td>Audio</td><td>Meyda 5.6.3</td><td>7 psychoacoustic features, not just FFT bins.</td></tr>
                        <tr><td>NLP</td><td>compromise.js + Transformers.js (MiniLM)</td><td>Sub-ms POS tagging + 23MB embedding model in Web Worker.</td></tr>
                        <tr><td>Backend</td><td>FastAPI + Python 3.13</td><td>Protocol-based interfaces, DI, Pydantic v2 validation.</td></tr>
                        <tr><td>Infra</td><td>Cloud Run + Terraform</td><td>Serverless GPU (L4). Pay only when generating shapes.</td></tr>
                        <tr><td>Testing</td><td>Vitest + pytest + Hypothesis</td><td>522+ tests. Property-based testing for numerical robustness.</td></tr>
                    </tbody>
                </table>

                {/* ═══════════════════════════════════════════════════════════
         * SECTION: GPU PARTICLE PHYSICS
         * ═══════════════════════════════════════════════════════════ */}
                <h2>GPU Particle Physics: 16,384 Particles at 110+ FPS</h2>

                <p>
                    The particle system uses Three.js's <code>GPUComputationRenderer</code> to run
                    physics entirely on the GPU via WebGL2 fragment shaders. Two 128×128 floating-point
                    textures store position and velocity for all 16,384 particles. Each frame, the GPU
                    reads both textures, computes forces, integrates, and writes back (ping-pong rendering).
                    The CPU never touches individual particle data.
                </p>

                <h3>Five-Force Composition</h3>

                <p>
                    The velocity shader composes five forces each frame:
                </p>

                <pre><code>{`// velocity.frag.glsl — Force composition (simplified)

// 1. Spring force: pull toward morph target
vec3 springForce = uSpringK * (targetPos - pos);

// 2. Curl noise: divergence-free turbulence (fluid-like motion)
vec3 noiseForce = uNoiseAmp * curlNoise(pos * uNoiseFreq + uTime * 0.1);

// 3. Drag: viscosity (prevents jitter, makes motion feel "heavy")
vec3 dragForce = -uDrag * vel;

// 4. Repulsion: scatter from cursor/touch
vec3 repulsionForce = computeRepulsion(pos, uPointerWorld, uRepulsionRadius);

// 5. Breathing: sinusoidal expansion/contraction (life-like rhythm)
vec3 breathForce = normalize(pos) * uBreathingAmp * sin(uTime * uBreathingFreq);

// Compose all forces
vec3 totalForce = springForce + noiseForce + dragForce + repulsionForce + breathForce;
vec3 newVel = vel + totalForce * uDelta;`}</code></pre>

                <blockquote>
                    <strong>Why curl noise?</strong> Curl noise is divergence-free (∇·(∇×F) = 0),
                    producing fluid-like motion with coherent eddies rather than chaotic dust. This is
                    what creates the "liquid smoke" aesthetic — particles flow in closed loops like fluid
                    rather than scattering randomly.
                </blockquote>

                {/* Ring + scatter side-by-side */}
                <div className="report-figure-row">
                    <div>
                        <img
                            src="/report-assets/milestone_ring.png"
                            alt="Particles in ring formation with curl noise"
                        />
                        <div className="report-figure__caption">Idle ring state — curl noise only</div>
                    </div>
                    <div>
                        <img
                            src="/report-assets/milestone_scatter.png"
                            alt="Particles in scattered formation during high energy speech"
                        />
                        <div className="report-figure__caption">High-energy speech — turbulence activated</div>
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════
         * SECTION: AUDIO-TO-VISUAL MAPPING
         * ═══════════════════════════════════════════════════════════ */}
                <h2>Audio-to-Visual Mapping: Seven Features, Seven Effects</h2>

                <p>
                    Meyda extracts seven psychoacoustic features from the microphone stream. Each drives
                    a distinct visual dimension — no cross-contamination.
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
                        <span className="feature-row__source">Zero-crossing + flatness</span>
                        <span className="feature-row__effect">Drag reduction + Z-spread</span>
                    </div>
                    <div className="feature-row">
                        <span className="feature-row__name">Texture (MFCC)</span>
                        <span className="feature-row__source">Cepstral coefficient variance</span>
                        <span className="feature-row__effect">Second noise octave</span>
                    </div>
                    <div className="feature-row">
                        <span className="feature-row__name">Rolloff</span>
                        <span className="feature-row__source">95% energy frequency</span>
                        <span className="feature-row__effect">Edge softness (crisp / soft)</span>
                    </div>
                    <div className="feature-row">
                        <span className="feature-row__name">Flatness</span>
                        <span className="feature-row__source">Spectral balance</span>
                        <span className="feature-row__effect">Base brightness</span>
                    </div>
                </div>

                {/* Analysis panel milestone */}
                <div className="report-figure">
                    <img
                        src="/report-assets/milestone_active.png"
                        alt="Analysis panel showing live audio feature bars during speech"
                    />
                    <div className="report-figure__caption">
                        The AnalysisPanel showing real-time audio features, STT status, and semantic
                        classification during live speech.
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════
         * SECTION: SPEECH-TO-3D PIPELINE
         * ═══════════════════════════════════════════════════════════ */}
                <h2>Speech-to-3D: The Server Pipeline</h2>

                <p>
                    When a concept doesn't match the local shape library, the server generates a
                    fully labeled 3D point cloud. Two paths exist, with automatic fallback:
                </p>

                <pre><code>{`Primary Path (PartCrafter):
  Text→Image (SDXL Turbo)  →  BG Removal  →  PartCrafter  →  Poisson Sampling
        ~1.0s                   ~0.1s          ~0.5s           ~20ms
                                                         → 2,048 labeled points (~27KB)

Fallback Path (Hunyuan3D + Grounded SAM):
  SDXL Turbo → BG Removal → Hunyuan3D-2 Turbo → Grounded SAM 2 → Sample
    ~1.0s        ~0.1s           ~1.5s              ~0.3s         ~20ms
                                                          Total: ~3.5s`}</code></pre>

                <p>
                    The output is designed for minimal payload: base64-encoded positions (24KB) +
                    part IDs (2KB) + part names + bounding box. Small enough to cache aggressively,
                    large enough for detailed part-based animation.
                </p>

                <h3>Cache Effectiveness (Checkpoint 3)</h3>

                <pre><code>{`Cache Hit Rate Analysis (200 requests):
  Overall hit rate:     74.0%
    Memory hits:        89 (44.5%)  →  p50: 2.4ms
    Storage hits:       59 (29.5%)  →  p50: 94.6ms
    Cache misses:       52 (26.0%)  →  p50: 3,023.7ms

Cost Projection at Scale:
    100 users/day   → $0.78/month
  1,000 users/day   → $1.56/month
 10,000 users/day   → $3.90/month

Top uncached concepts: horse (6), okapi (5), cat (4), narwhal (3)
→ Action: Add to pre-generation list`}</code></pre>

                {/* ═══════════════════════════════════════════════════════════
         * SECTION: ENGINEERING WAR STORIES
         * ═══════════════════════════════════════════════════════════ */}
                <h2>Engineering Under Constraint</h2>

                <h3>The Single-GPU Concurrency Fix</h3>

                <p>
                    During production testing, we discovered that 10/10 parallel requests to the
                    generation endpoint returned HTTP 500 with two distinct errors: <strong>"Already
                        borrowed"</strong> (PyTorch model accessed concurrently) and <strong>tensor
                            state corruption</strong> from shared buffers. This looked like a classic
                    thread-safety bug requiring a mutex.
                </p>

                <p>
                    But a deeper analysis revealed the infrastructure answer was better than the code
                    answer:
                </p>

                <ul>
                    <li>Our GPU quota was exactly <strong>1 GPU</strong>. Even with a mutex, requests would serialize on the GPU anyway.</li>
                    <li><code>containerConcurrency: 1</code> in Cloud Run makes the concurrency scenario <em>impossible</em> — zero-downside fix.</li>
                    <li>If we ever get more GPU quota, additional GPUs mean additional containers (each with its own GPU), not more requests per GPU. The fix scales correctly.</li>
                </ul>

                <div className="report-callout report-callout--decision">
                    <div className="report-callout__label">🧭 Decision</div>
                    <p style={{ margin: 0 }}>
                        One YAML line change (<code>containerConcurrency: 4 → 1</code>) eliminated the bug
                        entirely. The lesson: sometimes the right fix is infrastructure, not code.
                    </p>
                </div>

                <h3>The Mobile Speech Recognition Problem</h3>

                <p>
                    All iOS browsers use WebKit under the hood (Apple policy). Safari's{' '}
                    <code>SpeechRecognition</code> implementation is buggy: transcripts get duplicated,
                    recognition silently stops after the first result, <code>isFinal</code> is sometimes
                    never set to <code>true</code>, and Siri interferes with mic access.
                </p>

                <p>
                    I designed a three-tier fallback architecture:
                </p>

                <ol>
                    <li><strong>Web Speech API</strong> — used on Android Chrome / Desktop Chrome where it works reliably</li>
                    <li><strong>Moonshine Tiny</strong> (27M params, ~50MB ONNX) — runs 100% locally in the browser via Transformers.js for iOS</li>
                    <li><strong>Text input fallback</strong> — if the Moonshine model can't load within 5 seconds (slow connection), gracefully degrade to a text box</li>
                </ol>

                <p>
                    The key UX detail: when the 5-second timeout fires and we show the text input,
                    the model <em>keeps downloading in the background</em>. On the user's next visit,
                    it loads from the browser's Cache API instantly.
                </p>

                {/* ═══════════════════════════════════════════════════════════
         * SECTION: ITERATIVE METHODOLOGY
         * ═══════════════════════════════════════════════════════════ */}
                <h2>The Iterative Methodology</h2>

                <p>
                    Most engineers build first and analyze later. I baked in <strong>mandatory analysis
                        checkpoints</strong> — structured pauses after each major implementation phase where
                    session data is exported and analyzed quantitatively before deciding the next
                    engineering step.
                </p>

                <table>
                    <thead>
                        <tr><th>Phase</th><th>Question</th><th>Finding</th><th>Decision</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>0</strong></td>
                            <td>Where does the system fail?</td>
                            <td>Keyword classifier covers ~80 nouns; misses synonyms</td>
                            <td>Build embedding engine</td>
                        </tr>
                        <tr>
                            <td><strong>2</strong></td>
                            <td>Are generated shapes good?</td>
                            <td>PartCrafter produces coherent parts for ~70% of objects</td>
                            <td>Build fallback for remainder</td>
                        </tr>
                        <tr>
                            <td><strong>3</strong></td>
                            <td>Is caching working?</td>
                            <td>74% hit rate; $3.90/mo at 10K users/day</td>
                            <td>Pre-generate top 50 shapes</td>
                        </tr>
                    </tbody>
                </table>

                {/* ═══════════════════════════════════════════════════════════
         * SECTION: TBD ANALYSES
         * ═══════════════════════════════════════════════════════════ */}
                <h2>Planned Analyses</h2>

                <p>
                    The session logging infrastructure captures timestamped JSON containing audio
                    features (5×/second), workspace state (2×/second), transcript events, semantic
                    events, and system metrics. This enables a rich set of post-hoc analyses that
                    will strengthen the research claims:
                </p>

                <div className="report-callout report-callout--tbd">
                    <div className="report-callout__label">📊 TBD: Semantic Hit Rate Analysis</div>
                    <p style={{ margin: 0 }}>
                        Evaluate the percentage of utterances that produce confident shape matches across
                        all three Tier 1 subsystems. Measure coverage gaps: which semantic categories
                        (abstract nouns? compound phrases?) systematically fail? This will quantify the
                        embedding engine's actual contribution over bare keyword matching.
                    </p>
                </div>

                <div className="report-callout report-callout--tbd">
                    <div className="report-callout__label">📊 TBD: Audio Feature Correlation Matrix</div>
                    <p style={{ margin: 0 }}>
                        Export continuous speech sessions and compute the cross-correlation matrix for
                        all 7 Meyda features. The design principle is one-feature-one-dimension, so
                        features should be minimally correlated. High correlation would signal that two
                        visual effects are redundantly driven by the same vocal behavior.
                    </p>
                </div>

                <div className="report-callout report-callout--tbd">
                    <div className="report-callout__label">📊 TBD: Transition Smoothness Metrics</div>
                    <p style={{ margin: 0 }}>
                        Measure the timing of dissolution → mulling → convergence phases during shape
                        transitions. Quantify convergence latency (time to stable formation), overshoot
                        (velocity variance during ring-down), and persistence half-life (how long a
                        formation holds under silence).
                    </p>
                </div>

                <div className="report-callout report-callout--tbd">
                    <div className="report-callout__label">📊 TBD: 3D Shape Fidelity Audit</div>
                    <p style={{ margin: 0 }}>
                        Run batch generation of 50 concepts through both PartCrafter and the fallback
                        pipeline. Compare part decomposition quality (counts, proportions, spatial
                        distribution), measure generation latency distributions, and create visual
                        comparison grids of the resulting point clouds.
                    </p>
                </div>

                {/* ═══════════════════════════════════════════════════════════
         * SECTION: AUDIO MILESTONE
         * ═══════════════════════════════════════════════════════════ */}
                <h2>Milestone Gallery</h2>

                <div className="report-figure-row">
                    <div>
                        <img
                            src="/report-assets/milestone_wave.png"
                            alt="Particles in wave formation"
                        />
                        <div className="report-figure__caption">Wave formation target</div>
                    </div>
                    <div>
                        <img
                            src="/report-assets/milestone_tuning_panel.png"
                            alt="Tuning panel with real-time parameter sliders"
                        />
                        <div className="report-figure__caption">Real-time tuning panel for physics parameters</div>
                    </div>
                </div>

                <div className="report-figure">
                    <img
                        src="/report-assets/milestone_audio_recording.webp"
                        alt="Audio pipeline milestone recording showing speech-to-text and audio reactivity"
                    />
                    <div className="report-figure__caption">
                        Audio pipeline milestone — STT + audio reactivity working end-to-end.
                    </div>
                </div>

                <div className="report-figure-row">
                    <div>
                        <img
                            src="/report-assets/04_audio_reactivity_after.png"
                            alt="Audio reactivity debug view"
                        />
                        <div className="report-figure__caption">Audio reactivity — feature bars responding to speech</div>
                    </div>
                    <div>
                        <img
                            src="/report-assets/06_pipeline_restored.png"
                            alt="Full pipeline restored after debugging"
                        />
                        <div className="report-figure__caption">Full pipeline restored after debugging session</div>
                    </div>
                </div>

                {/* ═══════════════════════════════════════════════════════════
         * SECTION: WHAT I'D DO DIFFERENTLY
         * ═══════════════════════════════════════════════════════════ */}
                <h2>Honest Retrospective</h2>

                <p>
                    <strong>AFINN-165 for sentiment is a known limitation.</strong> It's a lightweight
                    baseline, not a serious affect model. Planned upgrade: GoEmotions-class classifier
                    or a compact model trained on session logs (audio features → emotion labels). The
                    instrumentation to evaluate this is already in place — this is an informed deferral,
                    not an oversight.
                </p>

                <p>
                    <strong>Theory lenses are operational metaphors.</strong> They make assumptions explicit
                    and testable, but they are not full computational implementations of GNW/AST. The point
                    is comparability and ablation, not philosophical overreach.
                </p>

                <p>
                    <strong>WebGPU migration is deferred, not forgotten.</strong> The GLSL fragment shaders
                    map almost 1:1 to WGSL compute shaders. Payoff: larger particle counts (131K+), proper
                    compute random access, better memory management. Estimated effort: 2–3 weeks.
                </p>

                <p>
                    <strong>CI/CD needs tightening.</strong> Cloud Build + Terraform works, but a
                    production-grade pipeline would add PR checks, staging, canaries, and automated test gates.
                </p>

                {/* ═══════════════════════════════════════════════════════════
         * SECTION: REFERENCES (collapsed)
         * ═══════════════════════════════════════════════════════════ */}
                <h2>Selected References</h2>

                <ol className="report-references">
                    <li>Shafir, T., et al. (2016). Emotion Regulation through Movement. <em>Frontiers in Psychology</em>, 6, 2030.</li>
                    <li>Valdez, P. &amp; Mehrabian, A. (1994). Effects of Color on Emotions. <em>J. Exp. Psych: General</em>, 123(4).</li>
                    <li>Jonauskaite, D., et al. (2020). Universal Patterns in Color–Emotion Associations. <em>Psychological Science</em>, 31(10).</li>
                    <li>Spence, C. (2011). Crossmodal correspondences: A tutorial review. <em>Attention, Perception, &amp; Psychophysics</em>, 73.</li>
                    <li>Palmer, S.E., et al. (2013). Music-color associations are mediated by emotion. <em>PNAS</em>, 110(22).</li>
                    <li>Bridson, R. (SIGGRAPH 2007). Curl-noise for procedural fluid motion.</li>
                    <li>Varela, F. (1996). Neurophenomenology. <em>J. Consciousness Studies</em>, 3(4).</li>
                    <li>Baars, B.J. (1988). <em>A Cognitive Theory of Consciousness</em>. Cambridge University Press.</li>
                    <li>Butlin, P., et al. (2023). Consciousness in AI. <em>arXiv:2308.08708</em>.</li>
                    <li>PartCrafter (NeurIPS 2025): Part-Aware 3D Object Generation.</li>
                    <li>Hunyuan3D-2 (Tencent, 2025): High-Resolution 3D Generation.</li>
                    <li>SDXL Turbo (Stability AI): Adversarial Diffusion Distillation.</li>
                    <li>Grounded SAM 2 (Meta): Segment Anything with Grounding.</li>
                    <li>compromise.js: Lightweight NLP for JavaScript.</li>
                    <li>MiniLM (Microsoft): Compressing Pre-Trained Transformers.</li>
                </ol>

            </div>

            {/* ── FOOTER ──────────────────────────────────────────────────── */}
            <footer className="report-footer">
                Built with React 19, Three.js, FastAPI, SDXL Turbo, PartCrafter, and a deep fascination with the nature of consciousness.
            </footer>
        </div>
    );
}
