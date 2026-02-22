# Tracking Work History

A running log of issues, fixes, and outcomes as we develop the Dots speech-to-visualization app.

## Table of Contents

| # | Entry | Date |
|---|-------|------|
| 1 | NPM Audit Vulnerability Fixes | 2026-02-20 |
| 2 | Particle Ring Rendering — Dense Solid Circle → Organic Scattered Dots | 2026-02-20 |
| 3 | Dots Disappear on "Start Listening" — Velocity Explosion Bug | 2026-02-20 |
| 4 | Audio Pipeline Overhaul — Three Fixes | 2026-02-20 |
| 5 | spectralFlux Regression — Meyda Callback Crash | 2026-02-20 |
| 6 | *(Entry removed — see note)* | — |
| 7 | Real-Time Tuning Sidebar Panel | 2026-02-21 |
| 8 | Unit Tests — Vitest + React Testing Library | 2026-02-20 |
| 9 | Phase 3 Prompt 3 — Expanded Procedural Morph Targets | 2026-02-20 |
| 10 | Morph Target Shape Controls in Tuning Sidebar | 2026-02-20 |
| 11 | SpeechEngine — Web Speech API + Text Fallback | 2026-02-20 |
| 12 | KeywordClassifier — Dictionary-Based Semantic Classification | 2026-02-20 |
| 13 | MILESTONE: Working Audio Visualization & Unincorporated STT Integration | 2026-02-20 |
| 14 | Camera Controls + Scaffold Cleanup | 2026-02-20 |
| 15 | Visual Controls: Formation Scale, Color Mode, Rainbow Fix | 2026-02-20 |
| 16 | Abstraction Slider + Test Fixes | 2026-02-20 |
| 17 | Flatness Slider, Mic Icon, Mobile Sizing | 2026-02-20 |
| 18 | Mic Permission Denied Tooltip | 2026-02-20 |
| 19 | Energy/Urgency Curve Toggles, MFCCs, Rolloff, Idle Button | 2026-02-20 |
| 20 | Comprehensive Unit Test Suite (42→185 tests) | 2026-02-20 |
| 21 | Sidebar Reorganization — Two-Tab Layout + Audio Grid | 2026-02-20 |
| 22 | SemanticBackend — Speech → Classification → Morph Pipeline | 2026-02-21 |
| 23 | MILESTONE: Visuals React to Simple Speech | 2026-02-21 |
| 24 | Sentiment-Driven Movement (LMA Effort Framework) | 2026-02-21 |
| 25 | Sentiment-Driven Color Shift | 2026-02-21 |
| 26 | Unit Test Coverage Expansion | 2026-02-21 |
| 27 | Ghost Transcript Display | 2026-02-21 |
| 28 | MILESTONE: Sentiment-Influenced Movement & Color Scaffolding | 2026-02-21 |
| 29 | *(Entry removed — see note)* | — |
| 30 | MILESTONE: Analysis Panel (Read-Only) | 2026-02-21 |
| 31 | Session Logger Service | 2026-02-21 |
| 32 | Spectral Centroid → Particle Color (Triple-Channel GPU Rewrite) | 2026-02-21 |
| 33 | Comprehensive Unit Test Suite (272→324 tests) | 2026-02-21 |
| 34 | Analysis Panel → Permanent Left-Side Fixture | 2026-02-21 |
| 35 | Physics De-Bounce Tuning | 2026-02-21 |
| 36 | Sentiment Color Rewrite (Rainbow → Color Mode) | 2026-02-21 |
| 37 | Sentiment Bar in Analysis Panel | 2026-02-21 |
| 38 | MILESTONE: Phase 4 — Sentiment-Driven Color, Analysis Panel, Session Logger | 2026-02-22 |
| 39 | GCP Infrastructure — Terraform (Cloud Run GPU, Artifact Registry, Storage, IAM) | 2026-02-22 |
| 40 | FastAPI Server Skeleton — App Factory, Pipeline, Cache, Protocols, Tests | 2026-02-22 |
| 41 | Server Audit & Code Review Fixes | 2026-02-22 |
| 42 | Numen → Lumen Rename | 2026-02-22 |

---

<details>
<summary><strong>1. NPM Audit Vulnerability Fixes</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>Issue</strong></summary>

`npm audit` flagged **11 vulnerabilities** (1 moderate, 10 high) across the ESLint / TypeScript-ESLint dependency tree.

| Package | Severity | Vulnerability |
|---------|----------|---------------|
| `minimatch` < 10.2.1 | 🔴 High | ReDoS via repeated wildcards ([GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26)) |
| `ajv` < 8.18.0 | 🟡 Moderate | ReDoS when using `$data` option ([GHSA-2g4f-4pwh-qvx6](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6)) |

</details>

<details>
<summary><strong>Why</strong></summary>

These are **transitive dependencies** — pulled in by `eslint` → `@eslint/eslintrc` → `ajv@6.x` and `typescript-eslint` → `@typescript-eslint/typescript-estree` → `minimatch@9.x`. The parent packages hadn't released updates with patched sub-dependencies, so `npm audit fix` and `npm audit fix --force` alone couldn't resolve them.

</details>

<details>
<summary><strong>Fix</strong></summary>

Updated direct dependencies and added `overrides` in [package.json](file:///Users/antoniaantonova/Documents/projects/dots/package.json) to force secure versions of nested packages:

```diff
  "devDependencies": {
-   "typescript-eslint": "^8.36.0",
+   "typescript-eslint": "^8.56.0",
  },
+ "overrides": {
+   "minimatch": "^10.2.2",
+   "ajv": "^8.18.0"
+ }
```

</details>

<details>
<summary><strong>Outcome</strong></summary>

- `npm audit` reports **0 vulnerabilities** ✅
- Production build (`npm run build`) passes cleanly ✅

</details>

</details>

---

<details>
<summary><strong>2. Particle Ring Rendering — Dense Solid Circle → Organic Scattered Dots</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>Issue</strong></summary>

On page load, the 16,384 GPU-simulated particles rendered as a **dense, solid-looking circle outline** instead of the intended sparse, organic ring of individually visible dots.

**Before (solid ring) vs Target (scattered dots):**

![Before: particles forming a solid ring outline](./screenshots/work_history/01_particles_before.png)

![Target: sparse, organic dots in a loose ring](./screenshots/work_history/02_particles_target.png)

</details>

<details>
<summary><strong>Why</strong></summary>

Three factors combined to create the dense-ring appearance:

1. **Uniform placement** — `MorphTargets.generateRing()` placed all 16,384 particles at **exactly** radius 3.0 with zero randomness, creating a perfect circle line
2. **Large point size** — `uPointSize: 6.0` with additive blending caused massive overlap between adjacent particles
3. **Hardcoded timestep** — `position.frag.glsl` used `0.016` instead of the `uDelta` uniform, causing inconsistent physics integration

</details>

<details>
<summary><strong>Fix</strong></summary>

Changes across **4 files**:

#### [MorphTargets.ts](file:///Users/antoniaantonova/Documents/projects/dots/src/engine/MorphTargets.ts) — Add scatter to ring

```diff
- const theta = (i / count) * Math.PI * 2;       // Even distribution
- const r = 3.0;
- const z = 0;
+ const theta = (i / count) * Math.PI * 2
+             + (Math.random() - 0.5) * 0.08;     // Angular jitter
+ const r = 3.0 + (Math.random() - 0.5) * 1.2;   // Radial scatter ±0.6
+ const z = (Math.random() - 0.5) * 0.5;          // Depth scatter
```

#### [ParticleSystem.ts](file:///Users/antoniaantonova/Documents/projects/dots/src/engine/ParticleSystem.ts) — Tune uniforms

| Uniform | Before | After | Reason |
|---------|--------|-------|--------|
| `uPointSize` | 6.0 | 1.5 | Individual dots visible instead of merged blob |
| `uAlpha` | 0.9 | 0.6 | Softer, more ethereal look |
| `uSpringK` | 3.0 | 1.5 | Looser spring = more organic drift |
| `uNoiseAmplitude` | 0.15 | 0.25 | More subtle organic movement |
| `uBreathingAmplitude` | 0.03 | 0.08 | More visible idle breathing |

#### [position.frag.glsl](file:///Users/antoniaantonova/Documents/projects/dots/src/shaders/position.frag.glsl) — Fix timestep

```diff
- position += velocity * 0.016;  // Hardcoded step
+ position += velocity * uDelta; // Correct delta time
```

#### [render.frag.glsl](file:///Users/antoniaantonova/Documents/projects/dots/src/shaders/render.frag.glsl) — Soft glow

Replaced the flat disc shader with a core + glow falloff for a star-like appearance:

```diff
- float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
- alpha *= uAlpha;
- gl_FragColor = vec4(uColor, alpha);
+ float core = 1.0 - smoothstep(0.0, 0.15, dist);
+ float glow = 1.0 - smoothstep(0.1, 0.5, dist);
+ float alpha = (core * 0.8 + glow * 0.4) * uAlpha;
+ gl_FragColor = vec4(uColor * (core * 0.5 + 0.5), alpha);
```

</details>

<details>
<summary><strong>Outcome</strong></summary>

Particles now render as a **scattered, organic ring** of glowing dots with visible breathing motion and pointer interaction ✅

**After fix — scattered dots with interaction:**

![After: organic scattered dots forming a ring](./screenshots/work_history/02_particles_after.png)

![Interaction: particles scatter when mouse hovers](./screenshots/work_history/02_particles_interaction.png)

</details>

</details>

---

<details>
<summary><strong>3. Dots Disappear on "Start Listening" — Velocity Explosion Bug</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>Issue</strong></summary>

Clicking the **"Start Listening"** button immediately caused **all 16,384 particles to vanish** from the screen.

</details>

<details>
<summary><strong>Why</strong></summary>

Exponential velocity growth! A compounding multiplier `velocity *= (1.0 + uEnergy * 2.0)` was applied **every frame**. Loud sounds (energy=0.3) multiplied velocity by 1.6 per frame, reaching billions of units in 1 second.

</details>

<details>
<summary><strong>Fix</strong></summary>

Replaced the compounding multiplier in [velocity.frag.glsl](file:///Users/antoniaantonova/Documents/projects/dots/src/shaders/velocity.frag.glsl) with a gentle **additive radial force**:

```diff
- // Speed Multiplier from Energy
- velocity *= (1.0 + uEnergy * 2.0);
+ // Energy → gentle outward push (spring pulls them back)
+ vec3 energyForce = normalize(position) * safeEnergy * 0.5;
```

Added safety clamping in [UniformBridge.ts](file:///Users/antoniaantonova/Documents/projects/dots/src/engine/UniformBridge.ts) to prevent input spikes from destabilizing the shader.

</details>

<details>
<summary><strong>Outcome</strong></summary>

Particles **remain visible and stable** when "Start Listening" is clicked ✅

![Particles stable while listening to audio](./screenshots/work_history/03_listening_fixed.png)

</details>

</details>

---

<details>
<summary><strong>4. Audio Pipeline Overhaul — Three Fixes</strong></summary>

**Date:** 2026-02-20

Three issues were preventing the audio-visual pipeline from feeling responsive. Each had a distinct root cause; all were fixed together.

---

<details>
<summary><strong>Issue A: Tension & Breathiness Bars Move in Lockstep</strong></summary>

**Symptom:** The Tension (spectral centroid) and Breath (ZCR) bars rose and fell together almost identically when speaking.

**Understanding the features:**

**Spectral Centroid** is the "center of mass" of the frequency spectrum. It answers: *where does most of the energy sit — in the low frequencies or the high frequencies?* A deep humming voice has a low centroid (~500 Hz). A bright, sharp "ssss" sound has a high centroid (~3000+ Hz). It's computed in the frequency domain (after FFT).

**ZCR (Zero Crossing Rate)** counts how many times the raw audio waveform crosses zero per buffer. It's computed directly on the time-domain signal — no FFT needed. A smooth tonal sound (like singing "aaah") crosses zero at a steady, low rate. A noisy/breathy sound (like whispering "shhh") crosses zero constantly and erratically because noise oscillates rapidly and randomly.

**Why they correlate in practice:** Both tend to go up when someone speaks in a bright, breathy, or high-pitched way, and both go down for deep, tonal, resonant speech. But they measure different things:

| Sound | Centroid | ZCR | Why |
|-------|----------|-----|-----|
| Breathy whisper "shhh" | Low-mid (noise spread across freqs) | **High** (lots of noise) | ZCR catches the noise character |
| Clear bright "eee" | **High** (harmonics concentrated high) | Low (tonal, steady crossings) | Centroid catches the brightness |
| Deep hum "mmm" | Low | Low | Both agree: low+tonal |
| Loud bright speech | High | High | Both correlate (this is normal) |

The distinction matters most at extremes — singing vs. whispering, tonal vs. airy. For casual speech they'll often track together, which is genuinely normal. The fix is making their **visual effects distinct** so even when the values correlate, the particle behavior looks different.

**Fix (in [velocity.frag.glsl](file:///Users/antoniaantonova/Documents/projects/dots/src/shaders/velocity.frag.glsl)):**

Also improved breathiness extraction in [AudioEngine.ts](file:///Users/antoniaantonova/Documents/projects/dots/src/services/AudioEngine.ts) — now blends ZCR (40%) with spectral flatness (60%). Flatness measures spectral shape rather than amplitude, so it's less correlated with energy.

</details>

<details>
<summary><strong>Issue B: Urgency Bar Stuck at Zero (and subsequent regression)</strong></summary>

**Original symptom:** `spectralFlux` was removed from Meyda's extractors and urgency was hardcoded to `0`.

**Initial fix:** Re-enabled `spectralFlux` in Meyda's `featureExtractors` array with auto-normalization.

**However:** This "fix" actually introduced a **regression** — see Entry 5 below. Adding `spectralFlux` silently crashed Meyda's entire ScriptProcessorNode callback, killing ALL audio features.

**Final fix:** Removed `spectralFlux` from Meyda entirely and computed urgency as an RMS-delta (frame-to-frame energy change) instead — see Entry 5 for full details.

</details>

<details>
<summary><strong>Issue C: Particles Not Reactive Enough</strong></summary>

**Root cause:** Conservative parameter ranges after the stability fix — ring expansion capped at 1.2 units, noise at 0.6, breathing boost at +0.5.

**Fix:** Increased all ranges and gave each feature a **distinct exclusive visual effect**:

| Feature | Visual Effect | Range | Why Distinct |
|---------|--------------|-------|--------------|
| **Energy** | Ring expansion + breathing amplitude + speed | 0→2.0 units, +0.8 amp, +0.5 speed | Makes ring grow/pulse — size change |
| **Tension** | Curl noise frequency (tighter swirls) + color | 0.8→2.0 freq | Makes particles swirl tighter — shape change |
| **Urgency** | Noise turbulence amplitude (chaos) | 0→0.8 amp | Makes particles jitter — chaos change |
| **Breathiness** | Drag reduction + Z-axis spread | drag 2.5→0.5, Z ±0.6 | Makes particles floaty + 3D — dimensionality |

```diff
  // ── TENSION → CURL FREQUENCY ONLY ──────────────────────
- float tensionFreq = uNoiseFrequency + safeTension * 0.8;
+ float tensionFreq = uNoiseFrequency + safeTension * 1.2;

  // ── ENERGY → BREATHING + EXPANSION ─────────────────────
- float dynamicBreathingAmp = uBreathingAmplitude + safeEnergy * 0.5;
- float breathSpeed = 0.2 + safeEnergy * 0.3;
+ float dynamicBreathingAmp = uBreathingAmplitude + safeEnergy * 0.8;
+ float breathSpeed = 0.2 + safeEnergy * 0.5;

- float energyExpansion = safeEnergy * 1.2;
+ float energyExpansion = safeEnergy * 2.0;
```

</details>

<details>
<summary><strong>Outcome</strong></summary>

- All four audio bars now move independently ✅
- Urgency bar reacts to speech onsets/transients ✅
- Particles visibly expand, shimmer, and float with speech ✅
- Each feature produces a visually distinct effect ✅

![Audio pipeline fixed — all bars active, particles reactive](./screenshots/work_history/05_audio_pipeline_fixed.png)

</details>

</details>

---

<details>
<summary><strong>5. spectralFlux Regression — Meyda Callback Crash</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>Issue: All Audio Features Suddenly Dead</strong></summary>

**Symptom:** After the Entry 4 changes, all four audio bars were stuck at zero. The mic was being acquired (browser showed mic icon), AudioContext state was `running`, Meyda analyzer was started — but the `processFeatures` callback **never fired**.

**How it was found:** Added three-tier diagnostic logging (`[RAW]`, `[SMOOTH]`, `[CALIBRATION]`, `[UNIFORMS]`) throughout the pipeline. The `[UNIFORMS]` logs appeared (all zeros), but `[RAW]` logs were **completely absent** — meaning Meyda's callback never ran.

**Root cause:** Entry 4, Issue B re-added `'spectralFlux'` to Meyda's `featureExtractors` array. The original code had removed it with the comment *"Removed 'spectralFlux' due to browser incompatibility/instability"* — and that warning was real.

When Meyda's ScriptProcessorNode attempts to compute `spectralFlux` and fails (certain browser/Meyda version combos), the entire `onaudioprocess` callback silently dies. No error is thrown. No console warning. The callback just stops being called, and **all** feature extraction goes to zero — not just flux.

This is a particularly nasty bug because:
- No error is visible in the console
- The AudioContext reports `running`
- The mic stream shows as active
- Everything *looks* correct — it just silently produces nothing

</details>

<details>
<summary><strong>Fix: Manual RMS-Delta Urgency</strong></summary>

Removed `spectralFlux` from Meyda's extractors and computed urgency manually as an **RMS-delta** (absolute frame-to-frame change in RMS loudness):

```diff
  featureExtractors: [
      'rms',
      'spectralCentroid',
-     'spectralFlux',
      'zcr',
      'spectralFlatness'
  ],

  // In processFeatures():
- const flux = raw.spectralFlux || 0;
- if (flux > this.maxFlux) this.maxFlux = flux;
- else this.maxFlux *= 0.998;
- const normFlux = Math.min(flux / this.maxFlux, 1.0);
+ const rmsDelta = Math.abs(rms - this.prevRms);
+ this.prevRms = rms;
+ const normDelta = Math.min((rmsDelta / this.maxRms) * 8.0, 1.0);
  this.features.urgency = this.smooth(
-     this.features.urgency, normFlux, 0.65
+     this.features.urgency, normDelta, 0.65
  );
```

**Why RMS-delta works as urgency:** Frame-to-frame energy change is an excellent transient detector. High delta = speech onset, consonant burst, sudden volume change. Low delta = sustained tone, silence, steady volume. It captures the same concept as spectral flux (rate of change) but operates on RMS (which Meyda computes reliably) rather than the problematic spectralFlux.

Also added `AudioContext.resume()` to the `start()` method — Chrome requires explicit resume after user gesture, though this wasn't the root cause in this case.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- All four audio bars now move with speech ✅
- Meyda callback fires reliably every buffer (~87x/sec at 512 buffer) ✅
- Console diagnostic confirms full pipeline: `[RAW]` → `[SMOOTH]` → `[CALIBRATION]` → `[UNIFORMS]` ✅
- Added protective "DO NOT add spectralFlux" comment to prevent future regressions ✅

![Pipeline fully restored — all bars active](./screenshots/work_history/06_pipeline_restored.png)

</details>

</details>

---

> [!NOTE]
> **Entry 6** was removed during editing. Numbering preserved to keep cross-references stable.

---

<details>
<summary><strong>7. Real-Time Tuning Sidebar Panel</strong></summary>

**Date:** 2026-02-21

<details>
<summary><strong>Issue</strong></summary>

All visual parameters (point size, opacity, spring strength, drag, noise, audio influence, smoothing, repulsion) were hardcoded across multiple files. To iterate on the feel of the visualizer, you had to edit code, recompile, and refresh — a slow creative loop that kills flow state.

</details>

<details>
<summary><strong>Solution</strong></summary>

Built a collapsible tuning sidebar panel with 20 real-time parameters.

**Architecture:**
- `TuningConfig.ts` (singleton) — central authority for all parameter values. Systems read from it each frame. Persists to `localStorage`, supports JSON export/import.
- `TuningPanel.tsx` — React sidebar triggered by a gear icon (⚙). Auto-generates sliders from `PARAM_DEFS`. Shows live audio feature values in green next to audio sliders.
- Integration: `ParticleSystem`, `UniformBridge`, `AudioEngine`, and `Canvas` all accept the config and read values from it each frame.

**Why a singleton?** All systems need the same config. A singleton avoids prop-drilling through the non-React GPU pipeline and ensures a single source of truth. The `onChange` listener pattern lets the React panel re-render when values change without polling.

**Why auto-generate sliders?** Adding a new parameter requires only one entry in `PARAM_DEFS` — the UI, persistence, and reset behavior all come for free. This is a standard pattern in production tools (think Unity's Inspector or Unreal's Details panel).

**Files created:** `TuningConfig.ts`, `TuningPanel.tsx`
**Files modified:** `velocity.frag.glsl`, `ParticleSystem.ts`, `UniformBridge.ts`, `AudioEngine.ts`, `Canvas.tsx`, `index.css`

</details>

<details>
<summary><strong>Outcome</strong></summary>

- TypeScript compiles with zero errors ✅
- Panel slides in/out with smooth animation ✅
- All 20 sliders update particle visuals in real time ✅
- Audio sections show live feature values ✅
- Copy Config → clipboard, Apply Pasted Config → restore ✅
- Settings persist across page reloads via localStorage ✅
- Reset All returns to defaults ✅

</details>

</details>

---

<details>
<summary><strong>8. Unit Tests — Vitest + React Testing Library</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>Issue</strong></summary>

The project had zero tests. The newly built TuningConfig singleton and TuningPanel/UIOverlay components had no automated verification — regressions could silently break the entire tuning system and audio bar display.

</details>

<details>
<summary><strong>Solution</strong></summary>

Installed Vitest (Vite-native test runner) + React Testing Library + jsdom, and created 3 test suites with 42 tests total.

**Why Vitest over Jest?** Vitest reuses the same Vite transform pipeline and config, so JSX, `.glsl` imports, and path resolution work out of the box — zero extra babel/webpack config needed.

**Infrastructure files:**
- `vite.config.ts` — added `test` block (jsdom environment, setup file, globals)
- `vitest.setup.ts` — loads `@testing-library/jest-dom` matchers
- `package.json` — added `"test": "vitest run"` script
- `tsconfig.node.json` — added `"vitest"` to types array

**Test suites:**
1. `TuningConfig.test.ts` (21 tests) — Pure logic: defaults, get/set/clamping, listeners, reset, JSON round-trip, localStorage persistence + corruption recovery
2. `TuningPanel.test.tsx` (13 tests) — React component: gear button, open/close, all sliders render, slider→config interaction, section headings, reset/paste buttons, live audio polling
3. `UIOverlay.test.tsx` (8 tests) — Audio bars: 4 labels render, mic button toggle, bar widths reflect features, row/bar/fill structure

</details>

<details>
<summary><strong>Outcome</strong></summary>

```
 ✓ TuningConfig.test.ts   (21 tests)   33ms
 ✓ UIOverlay.test.tsx       (8 tests)   84ms
 ✓ TuningPanel.test.tsx    (13 tests)  305ms

 Test Files  3 passed (3)
      Tests  42 passed (42)
   Duration  1.37s
```

- All 42 tests pass in 1.37s ✅
- Run with `npm test` ✅
- Test isolation via `localStorage.clear()` in beforeEach ✅

</details>

</details>

---

<details>
<summary><strong>9. Phase 3 Prompt 3 — Expanded Procedural Morph Targets</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>Issue</strong></summary>

The particle system only had 2 morph targets (ring and sphere). Phase 3 of the speech-to-visualization pipeline requires a library of recognizable shapes that speech keywords can trigger. Without a diverse shape library, the `KeywordClassifier` (next prompt) would have nothing to map to.

</details>

<details>
<summary><strong>Solution</strong></summary>

**Expanded `MorphTargets.ts` from 60 → 430 lines:**

Refactored to a pre-baked cache architecture using `Map<MorphTargetName, DataTexture>`. All 12 shapes are generated once at construction — zero runtime cost when switching.

**12 shapes:**

| Shape | Strategy | Visual Character |
|-------|----------|-----------------|
| ring | Circle in XY with organic jitter | Default idle |
| sphere | Fibonacci spiral distribution | Calm/peace |
| quadruped | Ellipsoid body + 4 leg cylinders | Animal |
| humanoid | Head + torso + arms + legs | Person |
| scatter | Random positions in large cube | Chaos/explosion |
| dual-attract | Two sphere clusters at x=±1.8 | Love/connection |
| wave | Sinusoidal XZ grid | Ocean/water |
| starburst | 14 radial rays from origin | Star/sun/fire |
| tree | Trunk cylinder + sphere canopy | Nature |
| mountain | Cone surface, wider at base | Terrain |
| building | Rectangular prism surface | Architecture |
| bird | V-shape wings + body cluster | Flight |

**New API methods:**

- `getTarget(name)` — returns pre-cached texture by name
- `blendTargets(a, b, blend)` — lerps between two shapes (for abstraction spectrum)
- `getAvailableTargets()` — returns all shape names
- Exported `MORPH_TARGET_NAMES` const and `MorphTargetName` type

**ParticleSystem integration:**

- `setTarget(name)` — swaps the `tMorphTarget` uniform texture
- `blendTargets(a, b, blend)` — sets a lerped target
- `currentTarget` property — tracks active shape name

**Canvas.tsx keyboard shortcuts (1-9, 0, -, =)** for instant shape cycling during development.

</details>

<details>
<summary><strong>Why</strong></summary>

1. **Pre-baked cache** avoids runtime generation cost. Each shape's 16,384 particle positions involve trig/random/branching — better to compute once.

2. **No shader changes needed.** The spring-force system in `velocity.frag.glsl` already handles transitions. When `tMorphTarget` changes, particles naturally flow to new positions over ~1.5s. This is the elegant benefit of the spring-based architecture.

3. **`blendTargets()` enables abstraction.** The speech pipeline will need to interpolate between concrete (e.g. quadruped) and abstract (e.g. scatter) shapes based on how abstract the speech content is.

4. **Exported types** allow the `KeywordClassifier` (next prompt) to reference valid shape names at compile time.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **TypeScript**: 0 errors
- **Tests**: 42/42 pass (1.03s)
- **Browser**: All 12 shapes verified visually — each is recognizable and distinct
- **Transitions**: Smooth spring-animated morphing between any two shapes
- **Keyboard shortcuts**: Press 1-9, 0, -, = to instant-switch shapes

</details>

</details>

---

<details>
<summary><strong>10. Morph Target Shape Controls in Tuning Sidebar</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>Issue</strong></summary>

The 12 morph target shapes built in entry #9 were only accessible via keyboard shortcuts (1-9, 0, -, =) and a `window.__particles` console hack. Users had no discoverable way to browse, select, or blend between shapes — the controls were invisible unless you read the source code.

</details>

<details>
<summary><strong>Fix</strong></summary>

Added a **🔷 Shape** section to the top of the tuning sidebar panel with three controls:

| Control | Type | Purpose |
|---------|------|---------|
| **Target** | `<select>` dropdown | Pick the primary morph target (all 12 names) |
| **Blend To** | `<select>` dropdown | Pick a secondary shape to blend towards |
| **Blend** | `<input type="range">` | Interpolate 0 → 1 between primary and secondary |

**Architecture choice**: TuningPanel receives focused `onShapeChange` and `onBlend` callbacks from Canvas.tsx, rather than direct access to ParticleSystem. This follows the **inversion of control** principle — the panel declares *what* it wants, and Canvas decides *how* to achieve it. Benefits:

- Panel remains unit-testable (mock callbacks, no GPU needed)
- Component boundaries stay clean (React state ↔ imperative GPU pipeline)
- `useCallback` ensures referential stability so TuningPanel doesn't re-render on every frame

**Files modified:**

| File | Change |
|------|--------|
| `index.css` | `.tuning-select` (styled native `<select>` with custom SVG arrow), `.tuning-shape-row` (flex layout), `.tuning-blend-row` (blend slider layout) |
| `TuningPanel.tsx` | New optional props (`currentShape`, `onShapeChange`, `onBlend`), local `blendTarget`/`blendAmount` state, Shape section JSX |
| `Canvas.tsx` | `currentShape` React state, `handleShapeChange`/`handleBlend` callbacks, keyboard handler syncs state, props wired to `<TuningPanel>` |

</details>

<details>
<summary><strong>Why</strong></summary>

1. **Native `<select>` over custom dropdown.** Native `<select>` is fully accessible (screen readers, keyboard nav) and renders native pickers on mobile/tablet. Custom dropdowns look prettier but break in edge cases.

2. **Blend is local state.** The blend amount only matters while the user is actively sliding. Canvas doesn't need to store it — it just forwards the calculated blend texture to the GPU. This avoids polluting the TuningConfig system (which is for persistent numeric parameters).

3. **Resetting blend on primary change.** When the user picks a new primary shape, blend resets to 0. This prevents confusing states where the blend slider is at 0.6 but pointing at a stale secondary target.

4. **Keyboard shortcuts preserved.** The 1-9/0/-/= shortcuts still work but now also update `currentShape` React state, so the dropdown stays in sync.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **TypeScript**: 0 errors
- **Tests**: 42/42 pass
- **Browser**: Shape section visible at top of panel, styled dropdowns match dark theme, all 12 shapes selectable, blend slider creates visible interpolated shapes
- **Console**: 0 errors during shape switching and blending

</details>

</details>

---

<details>
<summary><strong>11. SpeechEngine — Web Speech API + Text Fallback</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>Issue</strong></summary>

The particle system reacted to *how* speech sounded (volume, pitch, rhythm via AudioEngine + Meyda) but had no way to understand *what* was being said. To drive semantic shape morphing — where saying "bird" transforms the particles into a bird — we needed actual text transcription.

</details>

<details>
<summary><strong>Fix</strong></summary>

Created `src/services/SpeechEngine.ts` — a transcription service using the Web Speech API:

| Feature | Detail |
|---------|--------|
| **Primary path** | `SpeechRecognition` / `webkitSpeechRecognition` with `continuous=true`, `interimResults=true` |
| **Auto-restart** | On `end` event (Chrome stops every ~60s), restart after 300ms |
| **Error recovery** | On `error` event, retry after 1s (prevents crash loops) |
| **Callback pattern** | `onTranscript(cb)` returns unsub fn — same as `TuningConfig.onChange` |
| **Text fallback** | `submitText(text)` method for browsers without Web Speech API |
| **Type safety** | Custom TypeScript interfaces for `SpeechRecognition` API (avoids `@types/dom-speech-recognition` dep) |

**UIOverlay integration:**
- Mic button now starts/stops **both** AudioEngine and SpeechEngine simultaneously
- Ghost transcript display shows last recognized phrase above the mic button (fade-in animation via CSS `key` remount trick)
- Text-input fallback appears at bottom when Web Speech API is unavailable

**Files modified:**

| File | Change |
|------|--------|
| `SpeechEngine.ts` | **[NEW]** — 290-line transcription service |
| `UIOverlay.tsx` | Rewritten — dual start/stop, transcript display, text fallback |
| `Canvas.tsx` | SpeechEngine singleton, `onTranscript` console logging, `lastTranscript` state passed to TuningPanel |
| `TuningPanel.tsx` | New `transcript` prop, 🎤 Speech section with live transcript text between Shape and Particle Appearance |
| `index.css` | `.speech-fallback-*` input styles, `.transcript-display` ghost text, `.tuning-transcript-*` sidebar styles |
| `UIOverlay.test.tsx` | Added mock SpeechEngine to all test renders |

</details>

<details>
<summary><strong>Why</strong></summary>

1. **Web Speech API over Whisper/Deepgram.** Zero latency (no network round-trip), free, no API keys. Chrome uses the same engine as Google Assistant. Perfect for a real-time creative project where we need partial results *as the user speaks*.

2. **Fresh instance on each start().** Chrome's `SpeechRecognition` can get into broken states if you reuse a stopped instance. Creating a new one each time is the most reliable approach.

3. **`intentionallyStopped` flag.** Distinguishes user-initiated stop (don't restart) from browser auto-stop (restart). Without this flag, calling `stop()` would cause an infinite restart loop.

4. **Separate from AudioEngine.** Both need mic access but serve different purposes — AudioEngine extracts acoustic features, SpeechEngine extracts text. Keeping them separate follows single-responsibility principle.

5. **Ghost transcript with key remount.** React's `key` prop trick: incrementing the key on each new transcript forces React to unmount and remount the element, re-triggering the CSS `@keyframes` fade-in animation.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **TypeScript**: 0 errors
- **Tests**: 42/42 pass
- **Console**: `[SpeechEngine] Web Speech API ✅ supported` on page load
- **Architecture**: Ready for KeywordClassifier → morph target pipeline (next phase)

</details>

</details>

---

<details>
<summary><strong>12. KeywordClassifier — Dictionary-Based Semantic Classification</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>Purpose & Context</strong></summary>

**What this is:** The KeywordClassifier is the "brain" that sits between speech recognition and visuals. When a user speaks, the SpeechEngine transcribes the audio into text — but text alone doesn't tell the particle system what to do. The KeywordClassifier bridges that gap by analyzing the words and producing a `SemanticState` — a structured object that tells the renderer *which shape* to morph into, *how abstract* to render it, *what emotion* is being expressed, and *how intensely*.

**Where it fits in the pipeline:**
```
Mic → SpeechEngine → transcript text → KeywordClassifier → SemanticState → ParticleSystem
                                         (this entry)
```

**What it does NOT do (yet):** The classifier is currently standalone — it's not wired into the live transcript pipeline. That integration (connecting `SpeechEngine.onTranscript` → `KeywordClassifier.classify()` → `ParticleSystem.setTarget()`) is the next step. Right now you can verify it works by running the smoke test directly:

```bash
npx tsx -e "
import { KeywordClassifier } from './src/services/KeywordClassifier';
const c = new KeywordClassifier();
console.log(c.classify('the horse is galloping'));
console.log(c.classify('I feel so much love'));
console.log(c.classify('the terrible dark storm'));
"
```

</details>

<details>
<summary><strong>Fix</strong></summary>

Created three new files:

| File | Purpose |
|------|---------|
| `src/data/keywords.ts` | ~80 concrete nouns, ~50 abstract concepts, ~30 action modifiers → 12 morph targets |
| `src/data/sentiment.ts` | AFINN-165 subset (~150 words, −5 to +5 scores) |
| `src/services/KeywordClassifier.ts` | `SemanticState`/`SemanticBackend` interfaces + `classify()` algorithm |

**SemanticState interface:**
```typescript
interface SemanticState {
  morphTarget: string;        // e.g. "quadruped", "ring", "scatter"
  abstractionLevel: number;   // 0.0 (concrete) → 1.0 (abstract)
  sentiment: number;          // −1.0 (negative) → +1.0 (positive)
  emotionalIntensity: number; // 0.0 (calm) → 1.0 (intense)
  dominantWord: string;       // the keyword that triggered this
  confidence: number;         // 0.0 (guessing) → 1.0 (exact match)
}
```

**Keyword dictionary breakdown:**

| Category | Count | Abstraction | Examples |
|----------|-------|-------------|----------|
| Concrete nouns | ~80 | 0.1–0.3 | horse→quadruped, bird→bird, ocean→wave, star→starburst, tree→tree |
| Abstract concepts | ~50 | 0.5–0.9 | love→dual-attract, fear→scatter, peace→sphere, joy→starburst |
| Action modifiers | ~30 | n/a | galloping=1.5×, sleeping=0.3×, exploding=1.8× |

**classify() algorithm:**

```
Text → lowercase + strip punctuation + split words
  ├─→ Scan concrete nouns (priority 2) → morph target
  ├─→ Scan abstract concepts (priority 1) → morph target
  ├─→ Average AFINN sentiment scores → normalize to −1/+1
  └─→ Find most extreme action modifier → scale emotional intensity
  → Return SemanticState (or low-confidence default if no keyword found)
```

</details>

<details>
<summary><strong>Why</strong></summary>

1. **Dictionary over ML.** Zero latency (<0.1ms), no model download, no TF.js dependency. For a real-time creative tool, instant response is essential.

2. **Priority system (concrete > abstract).** When someone says "the angry horse is galloping", we want the concrete noun (horse → quadruped) not the abstract concept (anger → scatter). Concrete words carry the most visual intent.

3. **Average sentiment, not sum.** "Happy happy happy" should read as "very happy" (0.6), not saturate to 1.0. Averaging keeps sentiment proportional regardless of sentence length.

4. **Most extreme modifier wins.** If multiple modifiers appear ("galloping and exploding"), the most extreme one (exploding=1.8) defines the intensity. This prevents averaging down dramatic moments.

5. **SemanticBackend interface.** Abstraction layer for future swapability — could plug in Transformers.js or an API-based classifier without changing consumers.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **TypeScript**: 0 errors
- **Tests**: 42/42 pass
- **Smoke tests**: 5/5 correct classifications:

| Input | morphTarget | sentiment | intensity | confidence |
|-------|-------------|-----------|-----------|------------|
| `"the horse is galloping fast"` | quadruped | 0 | 0.75 | 0.9 |
| `"I feel so much love"` | dual-attract | +0.6 | 0.5 | 0.7 |
| `"what a beautiful amazing day"` | *(none — no keyword)* | +0.7 | 0.1 | 0.1 |
| `"hello world"` | *(none)* | 0 | 0.1 | 0.1 |
| `"the terrible dark storm"` | scatter | −0.5 | 0.5 | 0.9 |

- **Next step**: Wire KeywordClassifier into the transcript pipeline (Canvas.tsx)

</details>

</details>

---

<details>
<summary><strong>13. MILESTONE: Working Audio Visualization & Unincorporated STT Integration</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>Milestone Description</strong></summary>

This milestone marks the completion of the core audio-visual pipeline and the initial integration of speech-to-text capabilities.

*   **Working Audio Visualization**: The particle system is now fully responsive to real-time audio features (Energy, Tension, Urgency, Breathiness). We have implemented a library of 12 procedural morph targets and a real-time tuning panel for fine-grained control over the visual experience.
*   **Unincorporated STT Integration**: The `SpeechEngine` is fully functional, utilizing the Web Speech API for high-accuracy, low-latency transcription. While the `KeywordClassifier` is ready, it is not yet "incorporated" into the visual pipeline (i.e., keywords don't drive morphing yet), but the foundation for semantic visualization is solid.

</details>

<details>
<summary><strong>Visuals</strong></summary>

### Application Showcase
![Application Showcase](milestones/audio-viz-stt/milestone_active.png)

### Interaction Recording
![Interaction Recording](milestones/audio-viz-stt/milestone_recording.webp)

### Tuning Panel Controls
![Tuning Panel](milestones/audio-viz-stt/milestone_tuning_panel.png)

</details>

<details>
<summary><strong>Significant Notes & Decisions</strong></summary>

*   **Performance First**: Chose a dictionary-based `KeywordClassifier` over ML models to ensure sub-millisecond latency within the GPU-heavy environment.
*   **Resilient STT**: Implemented an auto-restart and error-recovery mechanism in `SpeechEngine` to handle browser-specific speech recognition limitations (e.g., Chrome's ~60s quiet-stop).
*   **Visual Distinction**: Mapped acoustic features to unique visual properties (Expansion, Turbulence, Swirl, Dimensionality) to ensure that incluso correlated audio signals produce distinct visual behaviors.

</details>

</details>

---

<details>
<summary><strong>14. Camera Controls + Scaffold Cleanup</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>Issue</strong></summary>

During Prompt 1 audit, gaps identified: no camera Z control (hardcoded at z=10), no camera type toggle (only perspective), Vite boilerplate in `App.css`, and `html` missing from CSS reset.

</details>

<details>
<summary><strong>Fix</strong></summary>

| File | Change |
|------|--------|
| `TuningConfig.ts` | Added `cameraZ` param (default 10, range 1–50, step 0.5) in new `📷 Camera` group |
| `TuningPanel.tsx` | Added `CameraType` export, projection dropdown (Perspective/Orthographic) in 📷 Camera section |
| `Canvas.tsx` | `cameraType` state, camera creation branching, per-frame `cameraZ` reads, orthographic frustum auto-sizing |
| `App.css` | Cleared all Vite boilerplate |
| `index.css` | Added `html` to CSS reset rule |

Switching camera type triggers full remount. Orthographic frustum sized via `frustumHalf = z * tan(fov/2)` to match perspective view.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **TypeScript**: 0 errors ✅
- **Camera Z slider**: Real-time in sidebar ✅
- **Camera type toggle**: Perspective ↔ Orthographic ✅
- **Boilerplate removed**, CSS reset fixed ✅

</details>

</details>

---

<details>
<summary><strong>15. Visual Controls: Formation Scale, Color Mode, Rainbow Fix</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>What changed</strong></summary>

1. **Formation Scale slider** — New `formationScale` param (0.2–3.0×, default 1.0) in the 🔴 Particle Appearance group. This multiplies all morph target positions in the velocity shader, so it works for ALL shapes (ring, sphere, quadruped, etc.), not just ring radius.

2. **Color Mode toggle** — New 🎨 Color Mode dropdown in the sidebar with "White" and "Rainbow" options. White mode uses the existing tension-based warm↔cool tint. Rainbow mode uses HSL→RGB conversion in the fragment shader with per-particle hue variation based on UV position and time-based animation.

3. **Rainbow color fix** — The previous attempt at color variation was too subtle (warm white ↔ cool white lerp). The new implementation uses full HSL color space with saturation 0.85 and lightness 0.6 for vivid, vibrant per-particle colors that cycle over time.

4. **Shader architecture changes** — `render.vert.glsl` now passes `vUV` varying + `uTime` uniform to the fragment shader. `render.frag.glsl` was rewritten with HSL→RGB conversion, `uColorMode` uniform (0=white, 1=rainbow), and per-particle hue `fract(vUV.x + vUV.y*0.5 + uTime*0.15)`.

</details>

<details>
<summary><strong>Why</strong></summary>

- **Formation Scale**: Users wanted to control ring/shape size interactively. A scale multiplier is more flexible than a raw radius value because it applies to all morph target shapes uniformly.
- **Rainbow Color**: The original tension-based color shift was barely perceptible. Moving to full HSL cycling with per-particle variation gives a dramatic, visually distinct mode.
- **Architecture**: Passing UV from vertex to fragment shader enables per-particle visual effects without extra textures or CPU computation.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **TypeScript**: 0 errors ✅
- **Tests**: 42/42 pass ✅ (TuningConfig tests auto-detect new `formationScale` param)
- **Formation Scale slider**: Shrinks/grows ring smoothly in real-time ✅
- **Rainbow mode**: Vivid multi-colored particles with time-based hue cycling ✅
- **White mode**: Unchanged tension-tinted behavior ✅
- **Alpha + Point Size sliders**: Already existed, confirmed still functional ✅

</details>

</details>

---

<details>
<summary><strong>16. Abstraction Slider + Test Fixes</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>What changed</strong></summary>

1. **Abstraction slider** — Added `abstraction` param (0–1, default 0) to 🔵 Physics group. Controls blend between spring force (shape lock) and curl noise (free drift). Wired through `ParticleSystem.update()` to `uAbstraction` uniform.

2. **Test fixes** — Updated 6 hardcoded `pointSize` assertions from 1.5 to 3.0 across `TuningConfig.test.ts` and `TuningPanel.test.tsx` to match the default change from Entry 15.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **TypeScript**: 0 errors ✅
- **Tests**: 42/42 pass ✅

</details>

</details>

---

<details>
<summary><strong>17. Flatness Slider, Mic Icon, Mobile Sizing</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>What changed</strong></summary>

1. **Flatness sliders** — Added `audioInfluence.flatness` (0–2, default 1.0) and `audioSmoothing.flatness` (0.1–0.99, default 0.60) to 🟢 Audio → Flatness group. Prepares for future shape coherence mapping.

2. **SVG mic icon** — Replaced text "Start/Stop Listening" button with a minimal 48px circle containing an SVG microphone icon. OFF state shows a diagonal slash overlay. ON state shows the icon with a soft white glow. Added `aria-label` for accessibility.

3. **Mobile 56px** — Added `@media (pointer: coarse)` responsive rule that enlarges the mic button to 56px on touch devices.

4. **Test updates** — Updated UIOverlay tests to use `getByLabelText()` instead of `getByText()` since the button no longer has text content.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **TypeScript**: 0 errors ✅
- **Tests**: 42/42 pass ✅

</details>

</details>

---

<details>
<summary><strong>18. Mic Permission Denied Tooltip</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>What changed</strong></summary>

Wrapped `audioEngine.start()` in try/catch. On denial, a red-tinted tooltip “Microphone access denied” fades in above the mic button and auto-dismisses after 3 seconds. Button stays in OFF state.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **TypeScript**: 0 errors ✅
- **Tests**: 42/42 pass ✅

</details>

</details>

---

<details>
<summary><strong>19. Energy/Urgency Curve Toggles, MFCCs, Rolloff, Idle Button</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>What changed</strong></summary>

### Energy Curve Mode Toggle
- Added sidebar toggle: **Linear (×3.5)** vs **Power (^1.5)**
- Velocity shader uses `mix()` between both modes via `uEnergyCurveMode` uniform
- Power mode quiets small energy values, making expansion more dramatic

### Urgency Curve Mode Toggle
- Added sidebar toggle: **Linear (×1.8)** vs **Smoothstep (threshold)**
- In smoothstep mode, conditional threshold sliders appear (Low/High, defaults 0.3/0.8)
- Smoothstep mode gates mild speech out entirely — only strong transients trigger chaos

### MFCC Variance → Texture Complexity (Prompt 5)
- Added `mfcc` to Meyda feature extractors (13 coefficients)
- Computes variance of MFCC array as a single metric of vocal texture richness
- Normalized to 0–1 (÷300), smoothed with α=0.88
- Drives `uTextureComplexity` in velocity shader → adds a second noise octave
- Sidebar: influence and smoothing sliders under "Audio → Texture" group

### Spectral Rolloff → Particle Edge Softness (Prompt 5)
- Added `spectralRolloff` to Meyda feature extractors
- Normalized from 1000–8000 Hz to 0–1, smoothed with α=0.88
- Drives `uRolloff` in render shader → modulates edge softness via `mix(0.45, 0.15, rolloff)`
- High rolloff (bright voice) = crisp particles; low rolloff (muffled) = soft glowing dots
- Sidebar: influence and smoothing sliders under "Audio → Rolloff" group

### Idle Reset Button
- Added "◎ Return to Idle" button in sidebar with teal accent glow
- Calls `UniformBridge.resetToIdle()` which zeroes all audio features
- Spring force handles smooth particle return to formation

### AudioFeatures Interface
- Added `textureComplexity: number` and `rolloff: number`

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **TypeScript**: 0 errors ✅
- **Tests**: 42/42 pass ✅
- **New params**: 14 (4 influence/smoothing for texture+rolloff, 4 curve shaping)
- **New uniforms**: 7 (uTextureComplexity, uRolloff, uEnergyCurveMode, uUrgencyCurveMode, uUrgencyThresholdLow, uUrgencyThresholdHigh, uRolloff)

</details>

</details>

---

<details>
<summary><strong>20. Comprehensive Unit Test Suite (42→185 tests)</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>Issue</strong></summary>

The project had only 3 test files (42 tests) covering TuningConfig, TuningPanel, and UIOverlay. Core logic modules — KeywordClassifier, MorphTargets, UniformBridge, AudioEngine, and data files — were entirely untested.

</details>

<details>
<summary><strong>Fix</strong></summary>

Added 5 new test files with 143 new tests:

| File | Tests | Coverage |
|---|---|---|
| `KeywordClassifier.test.ts` | 37 | Classification priority, sentiment, modifiers, edge cases |
| `MorphTargets.test.ts` | 46 | All 12 shapes validated (NaN, bounds), blending, fallback |
| `keywords.test.ts` | 21 | Data integrity: valid targets, ranges, no duplicates |
| `UniformBridge.test.ts` | 16 | Idle mode, influence scaling, clamping, curve/color modes |
| `AudioEngine.test.ts` | 23 | EMA smoothing, all 7 feature normalizations, auto-calibration |

Key testing patterns:
- Parameterized tests (`it.each`) for all 12 morph shapes
- Mock AudioEngine + ParticleSystem with stub uniforms
- Private method testing via `(engine as any)` for pure-logic verification
- Data guardrails validating keyword→target mappings against `MORPH_TARGET_NAMES`

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **Tests**: 185/185 pass (up from 42) ✅
- **TypeScript**: 0 errors ✅
- **Runtime**: 1.86s total

</details>

</details>

---

<details>
<summary><strong>21. Sidebar Reorganization — Two-Tab Layout + Audio Grid</strong></summary>

**Date:** 2026-02-20

<details>
<summary><strong>Issue</strong></summary>

The tuning sidebar had 12+ sections in a single scrollable list, making it overwhelming. Audio controls were split across 7 separate groups (Energy, Tension, Urgency, Breathiness, Flatness, Texture, Rolloff), each with only 2 sliders — wasteful of vertical space.

</details>

<details>
<summary><strong>Fix</strong></summary>

Reorganized into a two-tab layout with a pill toggle:

- **🎨 Visual** tab: Shape, Camera, Color Mode, Particle Appearance, Physics, Pointer Interaction
- **🎧 Audio** tab: Speech, Idle Reset, Audio Reactivity compact grid, Curve Shaping, Presets

The 7 separate audio sections were collapsed into one **🎚 Audio Reactivity** section using a compact 4-column grid (Feature | Influence | Smoothing | Live value). Each audio feature gets one row.

Files modified:
- `TuningConfig.ts` — consolidated audio groups, added `feature` field to `ParamDef`
- `TuningPanel.tsx` — two-tab state, tab pill UI, compact audio grid renderer
- `index.css` — tab bar, pill, audio grid, compact slider CSS
- `TuningPanel.test.tsx` — updated for tab navigation, added 6 new tests

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **Tests**: 191/191 pass (up from 185) ✅
- **TypeScript**: 0 errors ✅
- Sidebar content split ~50/50 between tabs — no scrolling needed for most panels

</details>

</details>

<details>
<summary><strong>22. SemanticBackend — Speech → Classification → Morph Pipeline</strong></summary>

**Date:** 2026-02-21

<details>
<summary><strong>Issue</strong></summary>

SpeechEngine, KeywordClassifier, MorphTargets, and ParticleSystem all existed independently but were not connected. Speaking into the mic produced transcripts that went nowhere — no semantic classification, no morph target changes.

</details>

<details>
<summary><strong>Fix</strong></summary>

Created `SemanticBackend.ts` as the orchestrator:

- Subscribes to SpeechEngine transcript events via event queue (callback only pushes, `update()` drains — avoids mid-frame race conditions)
- Classifies text via KeywordClassifier → SemanticState
- Drives ParticleSystem morph targets (setTarget / blendTargets)
- Animates abstraction level via UniformBridge overrides ("temporal crystallization")
- Implements idle behavior: hold shape on short silence, drift to ring after 5min continuous silence
- Implements "loosening" — brief noise bump when speech resumes after ≥2s silence (gated to prevent jitter during rapid speech)
- Interim debounce: same-target skip + 300ms cooldown prevents flickering from rapid interim results
- Mid-crystallization safe: `setTarget()` only swaps GPU texture, spring forces handle smooth redirect
- Logs all semantic events for session replay

Files modified:
- `SemanticBackend.ts` — **NEW** ~300 lines
- `UniformBridge.ts` — added `abstractionOverride` / `noiseOverride` fields
- `Canvas.tsx` — wired KeywordClassifier + SemanticBackend singletons, `update(dt)` in animation loop, cleanup

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **Tests**: 191/191 pass ✅
- **TypeScript**: 0 errors ✅
- **Browser**: `window.__semantic` confirmed wired, morph to quadruped works
- Say "horse" → particles crystallize into quadruped shape over ~1.5s

</details>

</details>

<details>
<summary><strong>23. MILESTONE: Visuals React to Simple Speech</strong></summary>

**Date:** 2026-02-21

<details>
<summary><strong>Milestone Description</strong></summary>

This milestone marks the first time the application "understands" and reacts to the user's voice content, not just its acoustics. We have successfully wired the Speech-to-Visualization pipeline.

- **Semantic Orchestration**: The `SemanticBackend` now connects `SpeechEngine` transcripts to `KeywordClassifier` logic and `ParticleSystem` morph targets.
- **Temporal Crystallization**: Visuals don't just snap; they "crystallize" from loose particles into structured forms (and back) as keywords are recognized or silence persists.
- **Responsive Interaction**: Final and high-confidence interim transcripts trigger immediate visual redirects, with built-in debouncing and hardening to ensure smooth performance during rapid speech.

</details>

<details>
<summary><strong>Visuals</strong></summary>

### Interaction Recording
![Semantic Pipeline in Action](milestones/semantic-morph/milestone_recording.webp)

### Morph Target Gallery
| Default (Ring) | Quadruped | Wave | Scatter |
|:---:|:---:|:---:|:---:|
| ![Ring](milestones/semantic-morph/milestone_ring.png) | ![Quadruped](milestones/semantic-morph/milestone_quadruped.png) | ![Wave](milestones/semantic-morph/milestone_wave.png) | ![Scatter](milestones/semantic-morph/milestone_scatter.png) |

</details>

<details>
<summary><strong>Significant Notes & Decisions</strong></summary>

- **Hardened Pipeline**: Implemented an event queue to process asynchronous transcripts specifically at the start of the animation frame, preventing state race conditions.
- **Organic Loosening**: Added a 0.3s noise-amplitude "loosening" effect when speech resumes after a pause, making the system feel "alive" and ready to respond.
- **Graceful Redirection**: Engineered the morph system to allow rapid keyword switching (e.g., "horse ocean") without jarring resets, using GPU-side spring forces for the transition.

</details>

</details>

---

<details>
<summary><strong>24. Sentiment-Driven Movement (LMA Effort Framework)</strong></summary>

**Date:** 2026-02-21

<details>
<summary><strong>Purpose & Context</strong></summary>

The particle system already mapped sentiment to **color shifts** (warm/cool tinting). But true emotional expression requires **movement quality** changes — the *way* particles move, not just their color. Observers attribute emotions to abstract shapes based on movement alone (Heider & Simmel, 1944).

This adds a "Sentiment Movement" toggle that modulates 5 physics parameters via the Laban Movement Analysis (LMA) Effort framework.

</details>

<details>
<summary><strong>Research Foundation</strong></summary>

| LMA Factor | Positive Pole (joy) | Negative Pole (anger/sad) | Particle Parameter |
|---|---|---|---|
| **Weight** | Light (buoyant) | Strong/Heavy (weighted) | `uSpringK` |
| **Time** | Sustained (flowing) | Quick/Sudden (jerky) | Noise Frequency |
| **Flow** | Free (released) | Bound (restricted) | `uDrag` |
| **Space** | Indirect (open) | Direct (narrow) | Noise Amplitude |

**Key sources:**
1. **Laban, R.** (1971). *The Mastery of Movement*
2. **Shafir, T. et al.** (2016). "Emotion Regulation through Movement" — *Frontiers in Human Neuroscience*
3. **Chi, D. et al.** (2000). "The EMOTE Model for Effort and Shape" — *SIGGRAPH*
4. **Lourens, T. et al.** (2010). "Communicating Emotions with Robots" — DMPs + spring-damper systems
5. **Heider, F. & Simmel, M.** (1944). "An Experimental Study of Apparent Behavior" — geometric shapes perceived as emotional from movement alone
6. **Alli, O. et al.** (2024). "Modeling Affective Computing With Particle Systems"

</details>

<details>
<summary><strong>Implementation</strong></summary>

**Emotion → Movement Mapping:**

| Sentiment | Spring K | Drag | Noise Amp | Noise Freq | Breathing | Character |
|---|---|---|---|---|---|---|
| +1 (joy) | −1.5 | −1.0 | −0.3 | −0.3 | +0.6 | Floating |
| 0 (neutral) | 0 | 0 | 0 | 0 | 0 | No change |
| −0.5 (sad) | +1.0 | +1.0 | −0.1 | −0.2 | −0.3 | Sinking |
| −1 (angry) | +0.5 | −0.5 | +1.0 | +0.8 | +0.3 | Aggressive |

**Files modified (7):** `velocity.frag.glsl`, `ParticleSystem.ts`, `UniformBridge.ts`, `TuningConfig.ts`, `TuningPanel.tsx`, `Canvas.tsx`, `UniformBridge.test.ts`

**Key decision:** Decoupled sentiment smoothing from color-only gating so movement works independently of color mode.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **TypeScript**: 0 errors ✅
- **Tests**: 206/206 pass ✅
- **Independence**: Movement works in both white and rainbow mode ✅
- **Composable**: Color + Movement toggles can be used independently or together ✅

</details>

</details>

---

<details>
<summary><strong>25. Sentiment-Driven Color Shift (Warm/Cool Tinting)</strong></summary>

**Date:** 2026-02-21

<details>
<summary><strong>Purpose & Context</strong></summary>

Before this change, Rainbow mode showed purely hue-cycled colors with no connection to emotional content. This adds a **warm/cool color overlay** driven by speech sentiment — positive words shift particles golden-amber, negative words shift them ocean-blue.

</details>

<details>
<summary><strong>Implementation</strong></summary>

**Shader layer (`render.frag.glsl`):**
- Added 4 new uniforms: `uSentiment` (−1 to +1), `uSentimentIntensity` (boldness 0–1), `uSentimentWarm` (vec3), `uSentimentCool` (vec3).
- After rainbow HSL is computed, a mix-blend overlay applies the tint: `mix(finalColor, tinted, sentAbs * intensity)` with additive luminance (`tint * 0.3`) to avoid darkening.

**Pipeline wiring:**
- `SemanticBackend.ts`: Pushes `sentimentOverride` on BOTH morph and hold actions + clears on dispose. Previously sentiment only flowed to movement — now it also drives color.
- `UniformBridge.ts`: Added `sentimentOverride`, `sentimentEnabled`, `smoothedSentiment`. Shared smoothing logic lerps toward target at configurable speed. Pushes all 4 sentiment uniforms to render shader every frame.
- `ParticleSystem.ts`: Initialized 4 new render uniforms (sentiment, intensity, warm/cool vec3).

**UI layer:**
- `TuningPanel.tsx`: "Sentiment Color" checkbox (Rainbow-only) + conditional 🎨 slider group (intensity, smoothing, warm/cool RGB).
- `Canvas.tsx`: `sentimentEnabled` state + toggle callback wiring to UniformBridge.
- `TuningConfig.ts`: 9 new PARAM_DEFS for the Sentiment Color group.

**Files modified (7):** `render.frag.glsl`, `SemanticBackend.ts`, `UniformBridge.ts`, `ParticleSystem.ts`, `TuningPanel.tsx`, `Canvas.tsx`, `TuningConfig.ts`

</details>

<details>
<summary><strong>Significant Notes & Decisions</strong></summary>

- **Rainbow-mode only:** Sentiment color is gated behind Rainbow mode + toggle. White mode's tension-tinted aesthetic would clash.
- **Shared smoothing:** A single `smoothedSentiment` in UniformBridge serves both color and movement features — both can be toggled independently.
- **Additive tinting:** `tint * finalColor + tint * 0.3` keeps particles visible even at full intensity (vs. multiply which darkens).

</details>

</details>

---

<details>
<summary><strong>26. Unit Test Coverage Expansion</strong></summary>

**Date:** 2026-02-21

<details>
<summary><strong>Purpose & Context</strong></summary>

Audited all 15 source modules against 8 existing test files. Found two complex modules with **zero test coverage**: `SemanticBackend.ts` (379 lines, pipeline orchestrator) and `SpeechEngine.ts` (372 lines, event-subscription model). Also identified edge-case gaps in `TuningConfig.test.ts`.

</details>

<details>
<summary><strong>Implementation</strong></summary>

**New: `SemanticBackend.test.ts` — 21 tests, 8 suites:**  
Queue draining, morph/hold actions, loosening (>2s silence gate, 0.3s expiry), 5-min silence reset to ring, abstraction lerp convergence, sentiment push (positive/negative/hold), event logging, and dispose cleanup.  
Mock strategy: Real `KeywordClassifier` + mock Speech/Particles/Bridge.

**New: `SpeechEngine.test.ts` — 15 tests, 4 suites:**  
Subscribe/unsubscribe, multi-listener isolation, bad listener recovery, submitText (trim, empty ignore), unsupported browser fallback, Web Speech API start/stop lifecycle.  
Mock strategy: Class-based `MockSpeechRecognition` on `window.webkitSpeechRecognition`.

**Modified: `TuningConfig.test.ts` — 4 new edge cases:**  
Full export→import round-trip, unknown key set(), no-dedup listener firing, resetAll+toJSON returns defaults.

**Also: `UniformBridge.test.ts` — 4 sentiment tests added in prior session** (+210 lines) covering sentiment smoothing for both color and movement features.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **Before:** 206 tests across 8 files
- **After:** 246 tests across 10 files (+40 new)
- **All 246 pass** ✅ | **TypeScript:** 0 errors ✅
- Remaining untested: `ParticleSystem.ts`, `Canvas.tsx` (GPU-dependent → integration/E2E)

</details>

</details>

---

<details>
<summary><strong>27. Ghost Transcript Display</strong></summary>

**Date:** 2026-02-21

<details>
<summary><strong>Purpose & Context</strong></summary>

Replaced the single-line transcript display in the TuningPanel sidebar with a **scrollable, fading word history** ("ghost transcript"). Words accumulate from final speech transcripts, fade by age over 6 seconds, and keywords that triggered morph-target changes get a golden glow highlight.

</details>

<details>
<summary><strong>Implementation</strong></summary>

**New: `GhostTranscript.ts` — Pure utility module:**
- `accumulateGhostWords()` — splits transcript text into words, detects keywords from `SemanticEvent`, appends to existing array, caps at 40 words
- `cleanupExpiredWords()` — removes words older than 6s, returns same array reference when nothing changed (React optimization)
- `ghostWordOpacity()` — computes display opacity: `1 - (age / 6000ms)`, clamped to 0.1 minimum

**Modified: `TuningPanel.tsx`:**
- Added `lastSemanticEvent` prop for keyword detection
- Replaced inline ghost word logic with calls to `GhostTranscript` utility functions
- 200ms interval cleanup timer for expired words
- Auto-scrolls to bottom when new words arrive

**Modified: `Canvas.tsx`:**
- Added `lastSemanticEvent` state from `SemanticBackend.getEventLog()`
- Passes it to TuningPanel on each final transcript event

**Modified: `index.css`:**
- `.ghost-transcript` — scrollable container, hidden scrollbar, 120px max-height
- `.ghost-word` — monospace 12px, `opacity` transition, slide-in animation
- `.ghost-word.keyword` — golden glow via `text-shadow`, bold weight
- `@keyframes ghost-word-in` — 4px slide-up + fade-in on entry

**New: `GhostTranscript.test.ts` — 26 tests, 3 suites:**
- `accumulateGhostWords` (16 tests): word splitting, ID assignment, timestamps, appending, interim rejection, whitespace handling, empty text, keyword detection (morph vs hold, case-insensitive, punctuation stripping, null/undefined events), capacity capping
- `cleanupExpiredWords` (5 tests): expiry removal, boundary behavior, reference identity, empty array, full expiry
- `ghostWordOpacity` (5 tests): brand-new word, half-life, full expiry minimum, boundary, 75% decay

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **Before:** 246 tests across 10 files
- **After:** 272 tests across 11 files (+26 new)
- **All 272 pass** ✅ | **TypeScript:** 0 errors ✅
- Ghost transcript renders correctly in the browser (verified with screenshots)

</details>

</details>

---

<details>
<summary><strong>28. MILESTONE: Sentiment-Influenced Movement & Color Scaffolding</strong></summary>

**Date:** 2026-02-21

<details>
<summary><strong>What Was Accomplished</strong></summary>

The full scaffolding for **sentiment-driven visual feedback** is now in place. Spoken words are classified for sentiment (AFINN lexicon), and that sentiment signal drives two independent visual channels:

1. **Color shift** (Rainbow mode) — warm gold tint for positive sentiment, cool blue for negative, via additive blending in `render.frag.glsl`
2. **Movement modulation** (all modes) — LMA Effort framework profiles in `velocity.frag.glsl`: joy (floating/light), sad (sinking/heavy), angry (aggressive/sharp)

Both channels share a single smoothed sentiment value from `UniformBridge`, with independent toggles in the tuning panel. The **ghost transcript** displays fading word history with keyword highlighting in the sidebar.

</details>

<details>
<summary><strong>Visuals</strong></summary>

### Angry Sentiment (Cool Tint & Sharp Movement)
![Angry Sentiment](milestones/sentiment-scaffolding/sentiment_angry.png)

### Happy Sentiment (Warm Tint & Fluid Movement)
![Happy Sentiment](milestones/sentiment-scaffolding/sentiment_happy.png)

### Interaction Recording
![Sentiment Interaction Demo](milestones/sentiment-scaffolding/demo_recording_v3.webp)

</details>

<details>
<summary><strong>What's Included</strong></summary>

| Feature | Status |
|---------|--------|
| Sentiment Color Shift (warm/cool tinting) | ✅ Implemented, gated behind Rainbow + toggle |
| Sentiment Movement (LMA profiles) | ✅ Implemented, independent toggle |
| Ghost Transcript (fading word history) | ✅ Implemented with keyword glow |
| Tuning Panel controls for both channels | ✅ Toggles + intensity/smoothing sliders |
| Unit tests | ✅ 272 tests across 11 files, all passing |
| TypeScript | ✅ 0 errors |

</details>

<details>
<summary><strong>What Needs Further Tweaking</strong></summary>

- **Sentiment intensity tuning** — current default values may feel too subtle; needs live testing with varied speech to find the sweet spot for color shift and movement modulation
- **Movement profiles** — joy/sad/angry profiles need iteration to make the visual difference between emotions more dramatic and immediately noticeable
- **Color warmth/coolness** — warm and cool RGB values may need adjustment for different particle densities and formation shapes
- **Smoothing speed** — sentiment smoothing factor may need per-profile tuning (e.g., anger should snap faster, sadness should linger)

</details>

</details>

---

</details>

---

<details>
<summary><strong>30. MILESTONE: Analysis Panel (Read-Only)</strong></summary>

**Date:** 2026-02-21

<details>
<summary><strong>What Was Accomplished</strong></summary>

Implemented a high-performance **Analysis Panel** overlay to visualize the system's internal state (Audio, Semantic, Workspace, and System metrics). It features a zero-overhead `requestAnimationFrame` loop that mutates DOM text nodes directly, avoiding costly React render cycles and preserving application frame rate.

The panel is toggled via the `A` key, and overlays seamlessly on the right side of the screen without interfering with pointer events destined for the canvas.

</details>

<details>
<summary><strong>Visuals</strong></summary>

### Live Polling Overlay
![Analysis Panel Screenshot](milestones/analysis-panel/panel_screenshot.png)

### Interaction Demo
![Responsive Panel Telemetry](milestones/analysis-panel/analysis_panel_demo.webp)

</details>

<details>
<summary><strong>What's Included</strong></summary>

| Component | Architecture |
|-----------|--------------|
| `AnalysisPanel.tsx` | Uses `useRef` bounds for raw DOM manipulation at 60fps |
| Audio Telemetry | Five continuous CSS-transition bars visualizing AudioEngine metrics |
| Cognitive State | Coherence, Entropy, and a pulsing 'breathing phase' indicator |
| System Monitor | FPS counter averaged over 500ms intervals |

</details>

</details>

---

<details>
<summary><strong>31. Session Logger Service</strong></summary>

**Date:** 2026-02-21

<details>
<summary><strong>Purpose & Context</strong></summary>

The application had no way to capture session data for post-hoc analysis or research. Audio features, transcripts, semantic classifications, and workspace state were all computed in real time but discarded after each frame. For building research pages (coherence-over-time charts, entropy analysis, etc.), a structured event buffer was needed.

</details>

<details>
<summary><strong>Implementation</strong></summary>

**New: `SessionLogger.ts` — Timestamped event buffer:**

| Feature | Detail |
|---------|--------|
| **Event types** | `audio`, `transcript`, `semantic`, `workspace`, `interaction`, `system` |
| **Buffer cap** | 10,000 events with smart eviction (audio first, then workspace, then any) |
| **API** | `log()`, `getEvents()`, `getEventsByType()`, `exportJSON()`, `downloadJSON()`, `clear()` |
| **JSON export** | Includes `sessionStart`, `sessionEnd`, `durationMs`, `eventCount`, and all events |
| **Browser download** | `downloadJSON()` creates Blob → Object URL → triggers `<a>` click download |

**Integration points:**

| File | Integration |
|------|-------------|
| `Canvas.tsx` | Periodic logging in animate loop: audio events every 200ms, workspace every 500ms |
| `SemanticBackend.ts` | Logs `transcript` events in `processTranscript()`, `semantic` events in `applyMorph()` |
| `AnalysisPanel.tsx` | Displays event count in SYSTEM section + download button (⬇️ Export Session JSON) |

**Eviction strategy design:** Audio events fire at ~5/sec, workspace at ~2/sec. A 10-minute session produces ~3,000 audio + 1,200 workspace + sparse transcript/semantic events. When the 10k cap is hit, oldest audio events are evicted first to preserve the more valuable transcript, semantic, and interaction records.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **TypeScript**: 0 errors ✅
- **Tests**: Verified in browser — event count increments, download produces valid JSON ✅
- **Architecture**: Singleton pattern, optional injection into SemanticBackend for backward compatibility ✅

</details>

</details>

---

<details>
<summary><strong>32. Spectral Centroid → Particle Color (Triple-Channel GPU Rewrite)</strong></summary>

**Date:** 2026-02-21

<details>
<summary><strong>Purpose & Context</strong></summary>

The previous color system had two problems:
1. **CPU-side color lerp** — `UniformBridge` computed warm↔cool color on the CPU via `THREE.Color.lerpColors()` and pushed it to `uColor`. This only worked in white mode and added CPU overhead.
2. **Separate sentiment uniforms** — `uSentimentIntensity`, `uSentimentWarm`, `uSentimentCool` (3 extra uniforms) were pushed every frame for a simple gold/blue overlay.

The goal: move all color logic to the GPU, make it work in **both** white and rainbow modes, and create a subtle "feel it, don't see it" emotional color language.

</details>

<details>
<summary><strong>Implementation</strong></summary>

**Shader rewrite (`render.frag.glsl`) — Triple-channel system:**

| Channel | Input | Effect | Strength |
|---------|-------|--------|----------|
| **Tension** | Spectral centroid (`uTension`) | Warm golden `(1.0, 0.95, 0.88)` ↔ cool icy `(0.88, 0.93, 1.0)` baseline | Full blend |
| **Sentiment** | Keyword classifier (`uSentiment`) | Gold `(1.0, 0.98, 0.9)` ↔ blue `(0.9, 0.93, 1.0)` overlay | Max 15% |
| **Energy** | RMS loudness (`uEnergy`) | Brightness boost | Max 30% |

All shifts are intentionally very subtle — particles always look mostly white with a gentle atmospheric tint.

**Pipeline changes:**

| File | Change |
|------|--------|
| `render.frag.glsl` | Rewrote color logic with inline warm/cool constants, removed 3 old uniforms |
| `ParticleSystem.ts` | Added `uTension` and `uEnergy` to render uniforms, removed `uSentimentIntensity`/`uSentimentWarm`/`uSentimentCool` |
| `UniformBridge.ts` | Pushes `uTension`/`uEnergy` to render shader each frame, removed CPU-side color lerp, removed `colorMode === 'rainbow'` gate from sentiment smoothing |

**Key design decisions:**
- **GPU-side tinting** eliminates CPU `THREE.Color` allocation per frame
- **Sentiment in both modes** — removed the rainbow-only gate so sentiment overlay works in white mode too
- **CPU baseline always white** — shader handles all tinting internally, CPU just sets neutral `(1.0, 1.0, 1.0)`

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **TypeScript**: 0 errors ✅
- **Browser verified**: 3 visual states confirmed via console uniform injection:
  - Default: neutral warm-white particles
  - High tension (`uTension=0.9`): subtle cool/icy tint
  - High energy + positive sentiment: brighter warm golden glow
- **Sentiment now mode-independent**: works in both white and rainbow modes ✅

</details>

</details>

---

<details>
<summary><strong>33. Comprehensive Unit Test Suite (272→324 tests)</strong></summary>

**Date:** 2026-02-21

<details>
<summary><strong>Purpose & Context</strong></summary>

Audited all 11 services/engines against 11 existing test files. Found two modules with **zero test coverage**: `SessionLogger.ts` (149 lines, event buffer) and `WorkspaceEngine.ts` (131 lines, state aggregator). Also found `SemanticBackend.test.ts` didn't cover the new SessionLogger integration, and 6 pre-existing tests had drifted due to the hierarchy traversal system.

</details>

<details>
<summary><strong>Implementation</strong></summary>

**New: `SessionLogger.test.ts` — 21 tests, 6 suites:**

| Suite | Tests | Coverage |
|-------|-------|----------|
| Basic Logging | 5 | Event creation, timestamps, ordering, all 6 event types |
| Event Filtering | 3 | `getEventsByType()`, empty results, readonly array |
| Buffer Cap & Eviction | 5 | 10k cap enforcement, audio-first eviction, workspace fallback, last-resort shift, precious event preservation |
| JSON Export | 4 | Valid JSON, event data integrity, non-negative duration, empty session |
| Clear/Reset | 3 | Event removal, session start reset, post-clear logging |
| eventCount | 1 | Getter matches array length |

**New: `WorkspaceEngine.test.ts` — 27 tests, 8 suites:**

| Suite | Tests | Coverage |
|-------|-------|----------|
| Initial State | 2 | Default values, base noise amplitude |
| Arousal | 4 | Silent=0, energy+urgency average, clamping, responsiveness |
| Utterance Timer | 3 | Accumulation, `registerSpeech()` reset, resume after reset |
| Idle Behavior | 5 | Pre-timeout hold, post-timeout decay, floor at 0, noise increase, noise reset |
| Semantic Integration | 5 | Concept tracking, valence, confidence, entropy formula, null reset, abstraction smoothing |
| Breathing Phase | 2 | Advancement, 2π wrapping |
| Coherence | 3 | High-abstraction=low, low-abstraction=high, clamping |
| State Isolation | 2 | Defensive copy, mutation safety |

**Modified: `SemanticBackend.test.ts` — 4 new tests (Suite 9: SessionLogger Integration):**
- Logs transcript events when logger provided
- Logs semantic events on morph
- Null-safe without logger
- Logs both transcript + semantic for same utterance

**Also fixed 6 pre-existing test failures** caused by hierarchy traversal drift — `horse` now routes through `sphere→quadruped` via hierarchy stages instead of direct morph. Updated assertions to expect `sphere` (first hierarchy stage) and handle hierarchy progression during long dt values.

**Modified: `UniformBridge.test.ts`:**
- Updated mock render uniforms: added `uTension`/`uEnergy`, removed `uSentimentIntensity`/`uSentimentWarm`/`uSentimentCool`
- Added 2 new tests for tension/energy render shader mapping
- Updated sentiment tests: sentiment now works in both white and rainbow modes

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **Before:** 272 tests across 11 files
- **After:** 324 tests across 13 files (+52 new)
- **All 324 pass** ✅ | **TypeScript:** 0 errors ✅
- **Coverage gaps closed:** SessionLogger (21 tests), WorkspaceEngine (27 tests), SemanticBackend+SessionLogger (4 tests)
- **Pre-existing drift fixed:** 6 SemanticBackend tests updated for hierarchy traversal

| Test File | Tests |
|-----------|-------|
| `SessionLogger.test.ts` | 21 (NEW) |
| `WorkspaceEngine.test.ts` | 27 (NEW) |
| `SemanticBackend.test.ts` | 29 (+4) |
| `UniformBridge.test.ts` | 31 (updated mocks) |
| All other files | unchanged |

</details>

</details>

---

<details>
<summary><strong>34. Analysis Panel → Permanent Left-Side Fixture</strong></summary>

**Date:** 2026-02-21

<details>
<summary><strong>Issue</strong></summary>

The Analysis Panel (AUDIO / SEMANTIC / WORKSPACE / TRANSCRIPT / SYSTEM telemetry) was hidden by default and required pressing `A` to toggle it on. It also displayed on the **right** side, competing with the Tuning Panel (⚙️). Meanwhile, the UIOverlay had a separate set of 4 audio debug bars (Energy, Tension, Urgency, Breath) on the **left** side — duplicating information already shown in the Analysis Panel’s AUDIO section.

</details>

<details>
<summary><strong>Fix</strong></summary>

**`AnalysisPanel.tsx` — 3 changes:**
1. **Always visible** — Removed `useState(false)` for `isVisible`, removed the `A` key toggle `useEffect`, removed the `if (!isVisible) return null` guard. The rAF loop now runs unconditionally.
2. **Left side** — Changed `right: 0` → `left: 0`, `borderLeft` → `borderRight`.
3. **Cleaned imports** — Removed unused `useState` import.

**`UIOverlay.tsx` — 3 changes:**
1. **Removed debug bars** — Deleted the entire `.debug-panel` block (4 audio feature bar rows).
2. **Removed feature polling** — Deleted the `features` state, `rafRef`, and the `useEffect` rAF polling loop that updated bars every frame.
3. **Cleaned imports** — Removed unused `useEffect` import.

**`UIOverlay.test.tsx` — 2 suites removed:**
- Suite 1 (Labels): tested `Energy`/`Tension`/`Urgency`/`Breath` labels and `.debug-row` count — now gone.
- Suite 3 (Bar Widths): tested `.debug-fill` widths at 0% and with non-zero features — now gone.
- Suite 2 (Mic Button): kept intact (3 tests).
- Test count: 319 (down from 324, −5 removed bar tests).

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **TypeScript**: 0 errors ✅
- **Tests**: 319/319 pass ✅
- **Layout**: Analysis Panel permanently visible on the left, Tuning Panel on the right, particles centered
- **No duplication**: Audio bars exist in one place only (Analysis Panel)
- **Mic button**: Still centered at bottom, unaffected

</details>

</details>

---

<details>
<summary><strong>35. Physics De-Bounce Tuning</strong></summary>

**Date:** 2026-02-21

<details>
<summary><strong>Issue</strong></summary>

Particles felt a touch too bouncy during idle and after morph transitions — overshooting their targets before settling, and the idle breathing pulse was more pronounced than desired.

</details>

<details>
<summary><strong>Fix</strong></summary>

Adjusted 2 default physics parameters in `TuningConfig.ts`:

| Parameter | Before | After | Effect |
|-----------|--------|-------|--------|
| `drag` | 2.5 | 3.0 | Particles settle faster, less overshoot on snap-back |
| `breathingAmplitude` | 0.08 | 0.05 | Gentler idle pulse, less visible oscillation |

Spring strength (`springK: 1.5`) and noise amplitude (`noiseAmplitude: 0.25`) left unchanged — the drag increase alone dampens the overshoot without making particles feel sluggish.

> **Note:** These are *default* values. Existing users with localStorage-persisted settings need to click **Reset All** in the Tuning Panel to pick up the new defaults.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- Particles settle into morph targets with minimal overshoot ✅
- Idle breathing is subtle and calm ✅
- Audio reactivity and speech morphing still feel responsive ✅

</details>

</details>

---

<details>
<summary><strong>36. Sentiment Color Rewrite (Rainbow → Color Mode)</strong></summary>

**Date:** 2026-02-21

<details>
<summary><strong>Issue</strong></summary>

1. **Wrong emotion colors** — Positive/negative sentiment mapped to a generic warm/cool overlay instead of distinct hues per emotion.
2. **Too much rainbow** — "Rainbow" mode used HSL cycling that drowned out sentiment colors. Even with sentiment enabled, the rainbow dominated.
3. **No angry vs sad distinction** — The shader had no way to distinguish angry (negative + high emotional intensity) from sad (negative + low emotional intensity).
4. **Naming** — The UI label "Rainbow" was misleading since the mode now serves an entirely different purpose.

</details>

<details>
<summary><strong>Fix</strong></summary>

**Shader rewrite (`render.frag.glsl`)**:
- Replaced rainbow HSL cycling with sentiment-driven monotone coloring:
  - **Happy** (positive sentiment): yellow-orange (hue ~36°, saturation ~0.7)
  - **Sad** (negative, low intensity): blue (hue ~216°)
  - **Angry** (negative, high intensity): red (hue ~0°)
  - **Neutral**: soft warm white (hue ~29°, saturation ~0.05)
- Added subtle per-particle hue variation (±0.03 hue) with slow time drift for organic feel
- Added new `uniform float uEmotionalIntensity` to distinguish angry from sad
- White mode unchanged (still uses tension-driven warm↔cool baseline)

**Uniform pipeline (3 files)**:
- `ParticleSystem.ts`: Added `uEmotionalIntensity: { value: 0.0 }` to render uniforms
- `UniformBridge.ts`:
  - Added `emotionalIntensityOverride: number | null` property
  - Pushes `uEmotionalIntensity` to shader alongside `uSentiment`
  - Renamed `ColorMode` type from `'white' | 'rainbow'` to `'white' | 'color'`
  - Updated all comments from rainbow → color
- `SemanticBackend.ts`: Sets `uniformBridge.emotionalIntensityOverride = state.emotionalIntensity` at all 3 call sites (morph, hold, dispose)

**UI rename (3 files)**:
- `TuningPanel.tsx`: Type `'rainbow'` → `'color'`, option label `Rainbow` → `Color`, conditional checks updated
- `Canvas.tsx`: Comments updated from rainbow → color
- `TuningConfig.ts`: Comment updated

**Physics (1 file)**:
- `TuningConfig.ts`: Drag bumped 3.0 → 3.5 for even less bounce

**Tests (2 files)**:
- `UniformBridge.test.ts`: Added `uEmotionalIntensity` to mock uniforms, renamed all `'rainbow'` → `'color'`
- `TuningConfig.test.ts`: Updated drag default expectations 2.5 → 3.5

</details>

<details>
<summary><strong>Files Changed</strong></summary>

| File | Changes |
|------|--------|
| `render.frag.glsl` | Rewrote color mode: rainbow HSL → sentiment-driven monotone |
| `ParticleSystem.ts` | Added `uEmotionalIntensity` uniform |
| `UniformBridge.ts` | Added `emotionalIntensityOverride`, renamed type `'rainbow'`→`'color'` |
| `SemanticBackend.ts` | Pipes `emotionalIntensity` to UniformBridge at 3 call sites |
| `TuningPanel.tsx` | Renamed option `Rainbow`→`Color`, updated conditionals |
| `Canvas.tsx` | Updated comments |
| `TuningConfig.ts` | Drag 3.0→3.5, updated comment |
| `UniformBridge.test.ts` | Added mock uniform, renamed `'rainbow'`→`'color'` |
| `TuningConfig.test.ts` | Updated drag default expectations |

</details>

<details>
<summary><strong>Outcome</strong></summary>

- **TypeScript**: 0 errors ✅
- **Tests**: 319/319 pass ✅
- Happy/sad/angry now produce visibly distinct, monotone colors ✅
- Color mode no longer drowns out sentiment with rainbow ✅
- Per-particle hue variation provides organic feel without rainbow cycling ✅

</details>

</details>

---

<details>
<summary><strong>37. Sentiment Bar in Analysis Panel</strong></summary>

**Date:** 2026-02-21

<details>
<summary><strong>Issue</strong></summary>

The SEMANTIC section of the Analysis Panel showed sentiment as plain text (`+0.30`). Since sentiment ranges from -1 to +1, a standard 0-1 bar wasn’t appropriate.

</details>

<details>
<summary><strong>Fix</strong></summary>

**`AnalysisPanel.tsx`** — replaced the text-only Sentiment row with a **centered-origin bar**:
- Center tick mark at 50% shows the zero point
- **Positive** sentiment: warm gold bar grows **right** from center
- **Negative** sentiment: cool blue bar grows **left** from center
- Numeric value still displayed alongside (`+0.30` / `-0.45`)
- CSS transitions for smooth animation (0.15s linear)
- Uses direct DOM refs (`sentimentBarRef`, `sentimentValRef`) for 60fps updates without React re-renders

</details>

<details>
<summary><strong>Outcome</strong></summary>

- Sentiment is now glanceable at a glance with direction and magnitude visible ✅
- Color-coded bar reinforces the semantics (gold=positive, blue=negative) ✅

</details>

</details>

---

<details>
<summary><strong>38. MILESTONE: Phase 4 — Sentiment-Driven Color, Analysis Panel, Session Logger</strong></summary>

**Date:** 2026-02-22

<details>
<summary><strong>What Was Accomplished</strong></summary>

The full **Phase 4** body of work is complete: the system now maps spoken sentiment to distinct visual colors, exposes all internal telemetry through a permanent analysis overlay, logs session data for research export, and has been physics-tuned for polished idle behavior.

Since the previous milestone (#30 — Analysis Panel Read-Only), **eight entries (#30–#37)** landed, touching:

- **GPU color pipeline** — Triple-channel spectral centroid → particle tinting (Entry 32), then a full sentiment-driven color rewrite replacing rainbow HSL cycling with emotion-mapped monotone hues (Entry 36)
- **Analysis telemetry** — Panel promoted to a permanent left-side fixture with centered-origin sentiment bar (Entries 34, 37)
- **Session logging** — Timestamped event buffer with smart eviction and JSON export (Entry 31)
- **Physics polish** — De-bounce tuning (drag 2.5→3.5, breathing amplitude 0.08→0.05) for smoother idle and transitions (Entry 35)
- **Test coverage** — Two major expansions (Entries 26, 33): 272 → 324 → 319 tests across 13 files
- **Ghost transcript** — Fading word history with keyword highlighting (Entry 27)

</details>

<details>
<summary><strong>Visuals</strong></summary>

### Full Interface — Analysis Panel + Particles
![Full interface with Analysis Panel on the left and particle ring visualization](milestones/phase4-sentiment-color/full_interface.png)

### Dual-Panel Layout — Analysis (Left) + Tuning (Right)
![Both panels open showing all controls and telemetry](milestones/phase4-sentiment-color/dual_panel_layout.png)

### Sentiment Color: Happy (Gold) → Sad (Blue) → Angry (Red)

![Happy sentiment — gold/yellow particles](milestones/phase4-sentiment-color/sentiment_happy.png)

![Sad sentiment — blue/teal particles](milestones/phase4-sentiment-color/sentiment_sad.png)

![Angry sentiment — red/bronze particles](milestones/phase4-sentiment-color/sentiment_angry.png)

### Sphere Morph + Session Logger
![Sphere morph target with session event logging visible](milestones/phase4-sentiment-color/sphere_morph.png)

### Phase 4 Feature Demo (Full Interaction)
![Phase 4 feature demo — sentiment colors, analysis panel, morph targets, session logger](milestones/phase4-sentiment-color/phase4_feature_demo.webp)

</details>

<details>
<summary><strong>What's Included</strong></summary>

| Feature | Status |
|---------|--------|
| Sentiment-driven color (happy=gold, sad=blue, angry=red) | ✅ GPU shader, replaces old rainbow |
| Emotional intensity uniform (`uEmotionalIntensity`) | ✅ Distinguishes angry from sad |
| Per-particle hue variation + slow time drift | ✅ Organic feel without rainbow cycling |
| Analysis Panel — permanent left-side fixture | ✅ Always visible, 60fps DOM updates |
| Centered-origin sentiment bar (gold↔blue) | ✅ Positive grows right, negative grows left |
| Session Logger (10k event buffer, JSON export) | ✅ Smart eviction, download button |
| Ghost Transcript (fading words, keyword glow) | ✅ 40-word cap, 6s decay |
| Physics de-bounce (drag 3.5, breathing 0.05) | ✅ Less overshoot, calmer idle |
| Unit tests | ✅ 319 tests across 13 files, all passing |
| TypeScript | ✅ 0 errors |
| Performance | ✅ 120 FPS @ 131,072 particles (WebGL2) |

</details>

<details>
<summary><strong>Architecture Snapshot</strong></summary>

**Live pipeline (as of this milestone):**

```
Mic → AudioEngine (Meyda) ──→ energy/tension/urgency/breathiness ──→ velocity.frag.glsl (movement)
   → SpeechEngine (Web Speech API) ──→ transcript text
       → KeywordClassifier ──→ SemanticState {morphTarget, sentiment, emotionalIntensity}
           → SemanticBackend ──→ ParticleSystem.setTarget() + UniformBridge
               → render.frag.glsl (sentiment color: happy/sad/angry/neutral)
               → velocity.frag.glsl (LMA effort profiles: joy/sad/angry)

WorkspaceEngine: arousal, coherence, entropy, breathing phase, idle timeout
SessionLogger: timestamped events → JSON export
AnalysisPanel: 60fps DOM polling of all subsystems
TuningPanel: 20+ real-time parameter sliders, shape controls, color mode toggle
```

**File count:** 25 source files changed in last 5 commits, ~4,500 insertions

</details>

<details>
<summary><strong>What's Next</strong></summary>

- **Live speech testing** — Iterate on sentiment intensity and movement profiles with varied real speech
- **Color palette refinement** — Fine-tune happy/sad/angry hue and saturation values for maximum readability at different particle densities
- **Smoothing per-profile** — Anger should snap faster, sadness should linger longer
- **Research export** — Use SessionLogger data for coherence-over-time charts and entropy analysis

</details>

</details>

---

<details>
<summary><strong>39. GCP Infrastructure — Terraform (Cloud Run GPU, Artifact Registry, Storage, IAM)</strong></summary>

**Date:** 2026-02-22

<details>
<summary><strong>Issue</strong></summary>

The Lumen ML pipeline server needs GPU-enabled cloud infrastructure to run SDXL Turbo + PartCrafter for real-time 3D point cloud generation. Without provisioned infrastructure, there's nowhere to deploy the container — no image registry, no GPU-enabled compute service, no cache bucket, no IAM bindings.

</details>

<details>
<summary><strong>Solution</strong></summary>

Implemented the full infrastructure stack as Terraform IaC following the `01_gcp_infrastructure_terraform.md` spec. All resources are defined declaratively with cross-references and least-privilege IAM.

**10 files created in `infrastructure/`:**

| File | Purpose |
|------|---------|
| `terraform/main.tf` | Provider config (google + google-beta), API enablement (5 APIs) |
| `terraform/cloud_run.tf` | GPU-enabled Cloud Run v2 service (NVIDIA L4, 24GB VRAM, 8 vCPU, 32GB RAM) |
| `terraform/artifact_registry.tf` | Docker repository with 30-day untagged image cleanup policy |
| `terraform/storage.tf` | Shape cache bucket with 90-day lifecycle + 30-day Nearline transition |
| `terraform/iam.tf` | Dedicated service account with `storage.objectAdmin` + `artifactregistry.reader` |
| `terraform/variables.tf` | 7 input variables (project_id required, rest have defaults) |
| `terraform/outputs.tf` | 5 outputs (Cloud Run URL, registry URL, bucket name, SA email, image URI) |
| `terraform/terraform.tfvars.example` | Template for users to configure their project |
| `cloudbuild.yaml` | 3-step pipeline: build → push → deploy (supports manual + automated triggers) |
| `README.md` | Setup guide, prerequisites, deploy instructions, cost estimates, teardown |

</details>

<details>
<summary><strong>Why</strong></summary>

1. **Terraform over Console UI.** Infrastructure-as-code ensures reproducibility, version control, and drift detection. The alternative — clicking through the GCP console — is unrepeatable and undocumented.

2. **Cloud Run over GKE/Compute Engine.** Cloud Run provides per-request billing (scale to zero), managed HTTPS, and built-in GPU support without managing nodes. For a single-model inference service, it's the right abstraction level — no Kubernetes complexity, no persistent VMs burning money during idle.

3. **Dedicated service account over default.** The default Compute Engine SA has `Editor` role — way too permissive. The dedicated `lumen-pipeline-runner` SA only gets `storage.objectAdmin` (read/write cache bucket) and `artifactregistry.reader` (pull container images). If the container is compromised, blast radius is minimal.

4. **Lifecycle policies on storage.** The shape cache bucket auto-transitions to Nearline after 30 days (cheaper storage for infrequently accessed shapes) and deletes after 90 days. Without this, cache grows unbounded.

5. **Untagged image cleanup.** Artifact Registry accumulates dangling layers from each rebuild. The 30-day cleanup policy prevents registry bloat.

6. **Cloud Build over local Docker build.** Building CUDA containers locally requires an NVIDIA GPU. Cloud Build runs in the cloud with access to CUDA base images, making builds portable and CI-friendly.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- All 10 files implemented and verified against spec ✅
- `terraform plan` ready to run (requires user's `project_id`) ✅
- GPU quota increase instructions documented ✅
- Committed as `5b26a86` ✅

</details>

</details>

---

<details>
<summary><strong>40. FastAPI Server Skeleton — App Factory, Pipeline, Cache, Protocols, Tests</strong></summary>

**Date:** 2026-02-22

<details>
<summary><strong>Issue</strong></summary>

With infrastructure provisioned, we need the actual server that runs on Cloud Run. This is the FastAPI application that will receive `POST /generate` requests with a noun (e.g., "horse"), run it through the ML pipeline (SDXL Turbo → PartCrafter → point sampling), and return a part-labeled 3D point cloud. At this stage, we're building the full skeleton with mock model calls — real ML models will be integrated in subsequent prompts.

</details>

<details>
<summary><strong>Solution</strong></summary>

Implemented a complete server following the `02_server_container_fastapi_skeleton.md` spec (1069 lines). The architecture is **service-oriented** with dependency injection, protocol-based model contracts, and a two-tier cache.

**41 files created in `server/`:**

| Component | Key Files | Purpose |
|-----------|-----------|--------|
| **App Factory** | `app/main.py` | `create_app()` factory + async `lifespan` (startup/shutdown), mounts routers, configures middleware |
| **Config** | `app/config.py` | Pydantic v2 `BaseSettings` — loads from env vars + `.env` file. `@lru_cache` singleton. |
| **Model Protocols** | `app/models/protocol.py` | 4 `Protocol` interfaces: `TextToImageModel`, `ImageToPartsModel`, `ImageToMeshModel`, `SegmentationModel` |
| **Model Registry** | `app/models/registry.py` | Manages model loading (eager primary, lazy fallback), guarded torch import for CPU testing |
| **Pipeline Orchestrator** | `app/services/pipeline.py` | Core business logic: cache check → template match → generate → encode → cache write |
| **Two-Tier Cache** | `app/cache/shape_cache.py` | In-memory LRU (100 items) + Cloud Storage backend. Async I/O via `run_in_executor`. |
| **Routes** | `app/routes/{generate,health,debug}.py` | Thin endpoints. `/generate` POST, `/health` liveness, `/health/ready` readiness, `/debug/*` diagnostics |
| **Schemas** | `app/schemas.py` | Pydantic v2 request/response models with validation (`@field_validator`) |
| **Exceptions** | `app/exceptions.py` | `LumenError` hierarchy: `ModelNotLoadedError`, `GenerationFailedError`, `TimeoutError`, `GPUOutOfMemoryError` |
| **Middleware** | `app/middleware.py` | Request ID, timing, structured logging. Skips `/health` to reduce noise. |
| **Logging** | `app/logging_config.py` | `structlog` — JSON renderer for Cloud Logging, console renderer for local dev |
| **Pipeline Utils** | `app/pipeline/{encoding,point_sampler,prompt_templates,template_matcher}.py` | Base64 encoding, point cloud sampling, SDXL prompt generation, noun→template mapping |
| **Dependencies** | `app/dependencies.py` | FastAPI `Depends()` providers for registry, cache, settings, orchestrator |
| **Tests** | `tests/` (9 files) | `conftest.py` fixtures, pipeline tests, property-based tests (hypothesis), schema factories (polyfactory), snapshots, HTTP mocking (respx) |
| **Infrastructure** | `Dockerfile`, `pyproject.toml`, `lets.yaml`, `scripts/build_and_deploy.sh` | CUDA 12.8 container, `uv` package manager, `lets-cli` task runner |

</details>

<details>
<summary><strong>Why These Architectural Choices</strong></summary>

1. **Service-Oriented over Clean Architecture.** The Lumen pipeline is fundamentally linear: text → image → mesh → point cloud. Clean Architecture's concentric layers (entities → use cases → adapters → frameworks) would add abstraction overhead without benefit for a pipeline that doesn't have complex business rules or multiple delivery mechanisms. SOA with DI keeps it testable without the ceremony.

2. **Protocol-based contracts over ABC inheritance.** Python's `Protocol` (PEP 544) provides structural subtyping — a class satisfies the protocol if it has the right methods, without inheriting from anything. This means:
   - ML model classes don't need to know about the protocol at all
   - No `super().__init__()` chains
   - Easy to mock in tests (any object with the right methods works)
   - `@runtime_checkable` allows `isinstance()` checks for model validation

3. **Two-tier cache (memory + Cloud Storage).** In-memory LRU handles hot items (same noun requested within seconds). Cloud Storage handles warm items (same noun requested across container restarts or different instances). This is the standard pattern for ML inference caches — memory for speed, persistent store for durability.

4. **`run_in_executor` for Cloud Storage I/O.** The `google-cloud-storage` client is synchronous. Wrapping it in `run_in_executor(None, ...)` runs it in the default thread pool, keeping the async event loop unblocked. This is critical — a synchronous GCS call would block all concurrent requests.

5. **Separate liveness vs readiness probes.** Cloud Run checks `/health` to know if the container process is alive (liveness) and `/health/ready` to know if it can serve traffic (readiness). Splitting these prevents Cloud Run from sending traffic to a container that's still loading models.

6. **`uv` over pip/poetry.** `uv` is 10-100x faster than pip for dependency resolution and installs. It produces a deterministic `uv.lock` file similar to Cargo.lock. For a project with heavy ML dependencies (PyTorch, diffusers, transformers), the speed difference is significant during Docker builds.

7. **Python 3.14 with PEP 649.** Deferred evaluation of annotations means you can use forward references and complex type hints without runtime import cost. The protocol string-quoted forward references (`"PIL.Image.Image"`) work naturally.

8. **`pyproject.toml` as single source of truth.** All metadata, dependencies, tool configs (ruff, mypy, pytest) live in one file. No `setup.cfg`, `setup.py`, `.flake8`, `mypy.ini`, `pytest.ini` scattered around.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- All 41 files implemented matching spec ✅
- Architecture: app factory + lifespan + DI + protocol contracts ✅
- 9 test files covering pipeline, schemas, properties, snapshots, HTTP mocking ✅
- Docker build ready for CUDA 12.8 + Python 3.14 ✅
- Committed as `c586c2c` ✅

</details>

</details>

---

<details>
<summary><strong>41. Server Audit & Code Review Fixes</strong></summary>

**Date:** 2026-02-22

<details>
<summary><strong>Issue</strong></summary>

A detailed code review of the FastAPI skeleton identified 4 real bugs and 1 design inconsistency that would cause problems at runtime or degrade the architecture:

| # | Issue | Severity |
|---|-------|----------|
| 1 | `get_settings()` not cached — re-reads env vars on every call | 🔴 Bug |
| 2 | `PipelineOrchestrator` created per-request instead of lifecycle-managed | 🟡 Design inconsistency |
| 3 | OOM exception handling uses fragile string matching | 🟡 Correctness |
| 4 | `structlog` double-processing — shared_processors ran twice | 🟡 Subtle bug |
| 5 | `MODEL_CACHE_DIR` in Terraform set to `/models` instead of `/home/appuser/models` | 🔴 Runtime bug |

The review also flagged 4 items that turned out to be non-issues (only present in a condensed code summary, not in the actual implementation): `ShapeCache.get` loop reference, `TemplateInfo` field naming, missing `debug.py`, and missing `get_canonical_prompt` usage.

</details>

<details>
<summary><strong>Fix</strong></summary>

**1. Settings caching** (`config.py`)

```diff
+from functools import lru_cache

+@lru_cache
 def get_settings() -> Settings:
     return Settings()
```

Without `@lru_cache`, every call to `get_settings()` creates a new `Settings()` instance, re-reading all environment variables and re-running Pydantic validation. This is called both in `create_app()` and `lifespan()`, and would be called on every request through the `Depends()` chain.

**2. Orchestrator DI** (`main.py`, `dependencies.py`, `routes/generate.py`)

```diff
# main.py lifespan
+ orchestrator = PipelineOrchestrator(registry, cache, settings)
+ app.state.pipeline_orchestrator = orchestrator

# dependencies.py
+ def get_pipeline_orchestrator(request: Request) -> PipelineOrchestrator:
+     return request.app.state.pipeline_orchestrator

# routes/generate.py — before
- orchestrator = PipelineOrchestrator(registry, cache, settings)
- return await orchestrator.generate(request)

# routes/generate.py — after
+ orchestrator: PipelineOrchestrator = Depends(get_pipeline_orchestrator)
+ return await orchestrator.generate(request)
```

Previously, a new `PipelineOrchestrator` was constructed on every request. While it was stateless, this was inconsistent with the rest of the architecture where everything (registry, cache, settings) is lifecycle-managed in `lifespan` and injected via `Depends()`.

**3. OOM exception handling** (`services/pipeline.py`)

```diff
- except Exception as e:
-     if "out of memory" in str(e).lower():
-         torch.cuda.empty_cache()
-         raise GPUOutOfMemoryError() from e

+ except Exception as e:
+     _is_oom = False
+     try:
+         import torch
+         if isinstance(e, torch.cuda.OutOfMemoryError):
+             torch.cuda.empty_cache()
+             _is_oom = True
+     except ImportError:
+         pass
+     if _is_oom:
+         raise GPUOutOfMemoryError() from e
```

`torch.cuda.OutOfMemoryError` is a real exception class. Catching it directly is more precise and less fragile than string matching — the old approach could false-positive on unrelated errors whose message happened to contain "out of memory".

**4. Logging double-processing** (`logging_config.py`)

```diff
  formatter = structlog.stdlib.ProcessorFormatter(
-     processors=[*shared_processors, renderer],
+     processors=[
+         structlog.stdlib.ProcessorFormatter.remove_processors_meta,
+         renderer,
+     ],
  )
```

`structlog.configure()` already runs `shared_processors` before handing events to the formatter. Adding them again in `ProcessorFormatter` caused double-processing — e.g., timestamps appearing twice, log levels being tagged redundantly.

**5. MODEL_CACHE_DIR** (`infrastructure/terraform/cloud_run.tf`)

```diff
-        value = "/models"
+        value = "/home/appuser/models"
```

The Dockerfile sets `HF_HOME=/home/appuser/models` and `TRANSFORMERS_CACHE=/home/appuser/models`. The Terraform env var must match or the server will look for models in the wrong directory.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- All 5 bugs fixed across 7 files ✅
- Settings properly cached as singleton ✅
- Orchestrator follows same DI pattern as all other components ✅
- OOM handling catches precise exception class ✅
- Logging produces clean, non-duplicated structured output ✅
- MODEL_CACHE_DIR matches Dockerfile path ✅
- Committed as `9eb0dba` ✅

</details>

</details>

---

<details>
<summary><strong>42. Numen → Lumen Rename</strong></summary>

**Date:** 2026-02-22

<details>
<summary><strong>Issue</strong></summary>

The project's original codename was "Numen" but the canonical name is "Lumen." All infrastructure, server, and planning files contained references to "numen" (in resource names, comments, display names, environment variables, Docker tags, and Terraform resource identifiers).

</details>

<details>
<summary><strong>Fix</strong></summary>

Searched the entire repo for all case variations and naming patterns:

| Pattern | Example | Replacement |
|---------|---------|-------------|
| `numen_pipeline` | Terraform resource names | `lumen_pipeline` |
| `numen-pipeline` | Cloud Run service, Docker tags, CLI commands | `lumen-pipeline` |
| `numen-shape-cache` | Storage bucket name | `lumen-shape-cache` |
| `numen-terraform-state` | Backend state bucket | `lumen-terraform-state` |
| `Numen` | Display names, comments, docstrings | `Lumen` |

**Files updated:** 13 infrastructure/server files + 4 planning docs + 1 filename rename (`Numen_Server_Pipeline_Final_Plan.md` → `Lumen_Server_Pipeline_Final_Plan.md`).

Used `sed` for bulk replacement and verified with `grep -ri numen` returning zero results.

</details>

<details>
<summary><strong>Why</strong></summary>

Consistent naming across all artifacts prevents confusion during deployment. If Terraform creates resources named `numen-pipeline` but the build script references `lumen-pipeline`, the deploy fails. This was purely a naming consistency sweep — no logic changes.

**Important Terraform note:** Since Terraform hadn't been applied yet, renaming the resource identifier (`numen_pipeline` → `lumen_pipeline`) was safe. If Terraform had already been applied, changing the resource name would cause it to destroy and recreate the Cloud Run service (Terraform tracks resources by their identifier). Since we're doing a fresh `terraform apply`, this is a clean rename.

</details>

<details>
<summary><strong>Outcome</strong></summary>

- Zero occurrences of "numen" remain in the repo ✅
- All 13 infrastructure/server files updated ✅
- All 4 planning docs updated ✅
- Filename renamed ✅
- Changes folded into original 2 commits (clean git history) ✅

</details>

</details>

---

<details>
<summary><strong>43. SDXL Turbo Integration Audit & Polish (Prompt 03)</strong></summary>

**Date:** 2026-02-22

<details>
<summary><strong>Issue</strong></summary>

Audited all Prompt 03 deliverables (SDXL Turbo model wrapper, lifespan wiring, pipeline integration, debug endpoint, tests) and found the core implementation was complete. However, 5 consistency/polish issues were identified:

| # | Issue | Severity |
|---|-------|----------|
| 1 | `from __future__ import annotations` in `sdxl_turbo.py` — contradicts Python 3.14 / PEP 649 standard | 🟡 Inconsistency |
| 2 | Debug endpoint manually constructs JSON error instead of using `ModelNotLoadedError` | 🔴 Pattern violation |
| 3 | Pipeline generates SDXL image then silently discards it — no clear handoff point for Prompt 04 | 🟡 Design |
| 4 | Mixed logging styles — `sdxl_turbo.py` uses `extra={}` dicts, `pipeline.py` uses f-strings, neither uses structlog's native `key=value` | 🟡 Inconsistency |
| 5 | No OOM test despite explicit OOM handling code in the model wrapper | 🟡 Coverage gap |

</details>

<details>
<summary><strong>Fix</strong></summary>

**1. Removed `from __future__ import annotations`** (`sdxl_turbo.py`)
Python 3.14 uses PEP 649 natively — the import is unnecessary.

**2. Debug endpoint uses exception hierarchy** (`debug.py`)
```diff
-        return Response(
-            content='{"error": "SDXL Turbo not loaded"}',
-            status_code=400,
-        )
+        raise ModelNotLoadedError("sdxl_turbo")
```
Returns 503 via the centralized `LumenError` handler — consistent with the pattern established in Prompt 02.

**3. Explicit image handoff** (`pipeline.py`)
```diff
-            image = sdxl.generate(prompt)
+            reference_image = sdxl.generate(prompt)
+            # TODO(prompt-04): pass reference_image to PartCrafter
```

**4. Full structlog migration** (6 files)
Migrated all server modules from `logging.getLogger()` to `structlog.get_logger()` with native `key=value` binding. Converted all f-string log messages to structured event names.

| File | Change |
|------|--------|
| `sdxl_turbo.py` | `extra={}` → `key=value` kwargs |
| `main.py` | `logging` → `structlog` |
| `pipeline.py` | f-strings → event names + kwargs |
| `registry.py` | f-strings → event names + kwargs |
| `exceptions.py` | f-strings → event names + kwargs |
| `shape_cache.py` | f-strings → event names + kwargs |

**5. OOM test** (`test_sdxl_turbo.py`)
Added `test_generate_oom_clears_cache_and_reraises` — creates a synthetic `OutOfMemoryError`, patches `torch.cuda.OutOfMemoryError` to match, verifies `torch.cuda.empty_cache()` is called and the error re-raises.

Also updated debug endpoint test: `assert status_code == 400` → `503` to match `ModelNotLoadedError`.

</details>

<details>
<summary><strong>Files Changed</strong></summary>

| File | Changes |
|------|---------|
| `app/models/sdxl_turbo.py` | Removed `__future__` import, structlog migration |
| `app/routes/debug.py` | `ModelNotLoadedError` instead of manual JSON |
| `app/services/pipeline.py` | `reference_image` + TODO, structlog migration |
| `app/models/registry.py` | structlog migration |
| `app/exceptions.py` | structlog migration |
| `app/cache/shape_cache.py` | structlog migration |
| `app/main.py` | structlog migration |
| `tests/test_sdxl_turbo.py` | OOM test, 400→503 status update |

</details>

<details>
<summary><strong>Outcome</strong></summary>

- All 5 polish issues fixed ✅
- structlog used consistently across all server modules ✅
- Exception hierarchy used consistently (no manual JSON responses) ✅
- OOM handling has test coverage ✅
- Clear handoff point for Prompt 04's PartCrafter integration ✅

</details>

</details>
