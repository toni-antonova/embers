/**
 * keywords.ts — Curated word → morph target mappings for the KeywordClassifier.
 *
 * WHY DICTIONARY LOOKUPS?
 * ───────────────────────
 * For a creative, real-time speech-to-visual system, we want classification
 * to be:
 *   1. **Instant** — no network round-trip, no model inference time
 *   2. **Interpretable** — you can see exactly why "horse" → quadruped
 *   3. **Tunable** — add/remove words without retraining anything
 *
 * The tradeoff is coverage: we only recognize words in our dictionary.
 * But for a performative art piece, a curated vocabulary is a *feature*,
 * not a limitation — it keeps the mapping intentional and aesthetic.
 *
 * STRUCTURE:
 * ──────────
 * Three tiers of word mappings, each serving a different purpose:
 *
 *   1. CONCRETE_NOUNS — Physical things → specific morph targets
 *      Low abstraction (0.1–0.2). "Horse" clearly means quadruped.
 *
 *   2. ABSTRACT_CONCEPTS — Emotions/ideas → behavioral morph targets
 *      High abstraction (0.5–0.9). "Love" means attraction, not a shape.
 *
 *   3. ACTION_MODIFIERS — Verbs/adjectives → intensity multipliers
 *      These modify HOW the shape behaves, not WHAT the shape is.
 *      Values > 1.0 = more energetic, < 1.0 = calmer.
 *
 * MORPH TARGET REFERENCE (12 available):
 * ──────────────────────────────────────
 * ring, sphere, quadruped, humanoid, scatter, dual-attract,
 * wave, starburst, tree, mountain, building, bird
 */

// ══════════════════════════════════════════════════════════════════════
// TYPE: Each keyword maps to a morph target name and an abstraction
// level. Abstraction tells the rendering system how "literal" to be:
//   0.0 = very concrete (particles form a recognizable shape)
//   1.0 = very abstract (particles behave loosely, more like a mood)
// ══════════════════════════════════════════════════════════════════════
export interface KeywordMapping {
    target: string;
    abstraction: number;
}

// ══════════════════════════════════════════════════════════════════════
// TIER 1: CONCRETE NOUNS
// ══════════════════════════════════════════════════════════════════════
// Physical objects and creatures → specific morph targets.
// These are the most "literal" mappings. When someone says "horse",
// they expect to see something horse-like.
//
// We map to the CLOSEST available morph target. E.g., "fish" maps to
// "wave" because we don't have a fish shape, and water is the closest
// visual association.
// ══════════════════════════════════════════════════════════════════════
export const CONCRETE_NOUNS: Record<string, KeywordMapping> = {
    // ── Animals (quadruped) ──────────────────────────────────────────
    horse: { target: 'quadruped', abstraction: 0.1 },
    dog: { target: 'quadruped', abstraction: 0.1 },
    cat: { target: 'quadruped', abstraction: 0.1 },
    wolf: { target: 'quadruped', abstraction: 0.1 },
    lion: { target: 'quadruped', abstraction: 0.1 },
    tiger: { target: 'quadruped', abstraction: 0.12 },
    deer: { target: 'quadruped', abstraction: 0.1 },
    bear: { target: 'quadruped', abstraction: 0.12 },
    fox: { target: 'quadruped', abstraction: 0.1 },
    elephant: { target: 'quadruped', abstraction: 0.12 },
    animal: { target: 'quadruped', abstraction: 0.15 },
    creature: { target: 'quadruped', abstraction: 0.2 },

    // ── People (humanoid) ────────────────────────────────────────────
    person: { target: 'humanoid', abstraction: 0.1 },
    man: { target: 'humanoid', abstraction: 0.1 },
    woman: { target: 'humanoid', abstraction: 0.1 },
    child: { target: 'humanoid', abstraction: 0.1 },
    body: { target: 'humanoid', abstraction: 0.12 },
    human: { target: 'humanoid', abstraction: 0.1 },
    dancer: { target: 'humanoid', abstraction: 0.15 },
    figure: { target: 'humanoid', abstraction: 0.15 },
    people: { target: 'humanoid', abstraction: 0.12 },

    // ── Water & waves ────────────────────────────────────────────────
    ocean: { target: 'wave', abstraction: 0.1 },
    water: { target: 'wave', abstraction: 0.15 },
    wave: { target: 'wave', abstraction: 0.15 },
    river: { target: 'wave', abstraction: 0.15 },
    sea: { target: 'wave', abstraction: 0.1 },
    rain: { target: 'wave', abstraction: 0.2 },
    tide: { target: 'wave', abstraction: 0.15 },
    flood: { target: 'wave', abstraction: 0.15 },
    fish: { target: 'wave', abstraction: 0.15 },  // no fish target → closest: wave

    // ── Celestial / light (starburst) ────────────────────────────────
    star: { target: 'starburst', abstraction: 0.1 },
    sun: { target: 'starburst', abstraction: 0.1 },
    light: { target: 'starburst', abstraction: 0.2 },
    fire: { target: 'starburst', abstraction: 0.15 },
    flame: { target: 'starburst', abstraction: 0.15 },
    spark: { target: 'starburst', abstraction: 0.15 },
    lightning: { target: 'starburst', abstraction: 0.15 },
    moon: { target: 'sphere', abstraction: 0.1 },
    planet: { target: 'sphere', abstraction: 0.1 },
    earth: { target: 'sphere', abstraction: 0.12 },
    globe: { target: 'sphere', abstraction: 0.1 },
    ball: { target: 'sphere', abstraction: 0.1 },
    bubble: { target: 'sphere', abstraction: 0.15 },

    // ── Nature ───────────────────────────────────────────────────────
    tree: { target: 'tree', abstraction: 0.1 },
    forest: { target: 'tree', abstraction: 0.15 },
    flower: { target: 'tree', abstraction: 0.15 },
    garden: { target: 'tree', abstraction: 0.15 },
    leaf: { target: 'tree', abstraction: 0.12 },
    plant: { target: 'tree', abstraction: 0.12 },
    mountain: { target: 'mountain', abstraction: 0.1 },
    hill: { target: 'mountain', abstraction: 0.12 },
    cliff: { target: 'mountain', abstraction: 0.12 },
    rock: { target: 'mountain', abstraction: 0.15 },
    volcano: { target: 'mountain', abstraction: 0.12 },

    // ── Structures (building) ────────────────────────────────────────
    house: { target: 'building', abstraction: 0.1 },
    building: { target: 'building', abstraction: 0.1 },
    tower: { target: 'building', abstraction: 0.1 },
    castle: { target: 'building', abstraction: 0.1 },
    city: { target: 'building', abstraction: 0.15 },
    wall: { target: 'building', abstraction: 0.15 },
    bridge: { target: 'building', abstraction: 0.12 },

    // ── Birds ────────────────────────────────────────────────────────
    bird: { target: 'bird', abstraction: 0.1 },
    eagle: { target: 'bird', abstraction: 0.1 },
    hawk: { target: 'bird', abstraction: 0.1 },
    dove: { target: 'bird', abstraction: 0.1 },
    owl: { target: 'bird', abstraction: 0.1 },
    crow: { target: 'bird', abstraction: 0.1 },
    wing: { target: 'bird', abstraction: 0.15 },
    feather: { target: 'bird', abstraction: 0.15 },

    // ── Chaos / destruction (scatter) ────────────────────────────────
    explosion: { target: 'scatter', abstraction: 0.2 },
    chaos: { target: 'scatter', abstraction: 0.3 },
    destroy: { target: 'scatter', abstraction: 0.3 },
    shatter: { target: 'scatter', abstraction: 0.2 },
    break: { target: 'scatter', abstraction: 0.25 },
    crash: { target: 'scatter', abstraction: 0.2 },
    storm: { target: 'scatter', abstraction: 0.25 },
    tornado: { target: 'scatter', abstraction: 0.2 },
    wind: { target: 'scatter', abstraction: 0.25 },

    // ── Ring / circle ────────────────────────────────────────────────
    ring: { target: 'ring', abstraction: 0.1 },
    circle: { target: 'ring', abstraction: 0.1 },
    loop: { target: 'ring', abstraction: 0.12 },
    orbit: { target: 'ring', abstraction: 0.15 },
    halo: { target: 'ring', abstraction: 0.15 },
    wheel: { target: 'ring', abstraction: 0.1 },
};


// ══════════════════════════════════════════════════════════════════════
// TIER 2: ABSTRACT CONCEPTS
// ══════════════════════════════════════════════════════════════════════
// Emotions, ideas, and states → behavioral morph targets.
// These are higher-abstraction: "love" doesn't look like anything
// specific, but it BEHAVES like attraction (dual-attract).
//
// The abstraction level is 0.5–0.9 because these words are inherently
// non-literal. The rendering system should respond more loosely —
// affecting physics/color/speed rather than shape fidelity.
// ══════════════════════════════════════════════════════════════════════
export const ABSTRACT_CONCEPTS: Record<string, KeywordMapping> = {
    // ── Attraction / connection (dual-attract) ───────────────────────
    love: { target: 'dual-attract', abstraction: 0.8 },
    together: { target: 'dual-attract', abstraction: 0.7 },
    hug: { target: 'dual-attract', abstraction: 0.6 },
    embrace: { target: 'dual-attract', abstraction: 0.65 },
    connect: { target: 'dual-attract', abstraction: 0.7 },
    bond: { target: 'dual-attract', abstraction: 0.75 },
    unite: { target: 'dual-attract', abstraction: 0.7 },
    hold: { target: 'dual-attract', abstraction: 0.6 },

    // ── Dispersion / chaos (scatter) ─────────────────────────────────
    hate: { target: 'scatter', abstraction: 0.8 },
    anger: { target: 'scatter', abstraction: 0.75 },
    rage: { target: 'scatter', abstraction: 0.8 },
    freedom: { target: 'scatter', abstraction: 0.85 },
    fear: { target: 'scatter', abstraction: 0.8 },
    anxiety: { target: 'scatter', abstraction: 0.8 },
    panic: { target: 'scatter', abstraction: 0.75 },
    war: { target: 'scatter', abstraction: 0.7 },
    violence: { target: 'scatter', abstraction: 0.75 },

    // ── Calm / wholeness (sphere) ────────────────────────────────────
    peace: { target: 'sphere', abstraction: 0.7 },
    calm: { target: 'sphere', abstraction: 0.65 },
    serenity: { target: 'sphere', abstraction: 0.75 },
    harmony: { target: 'sphere', abstraction: 0.7 },
    balance: { target: 'sphere', abstraction: 0.7 },
    quiet: { target: 'sphere', abstraction: 0.65 },
    still: { target: 'sphere', abstraction: 0.6 },
    sadness: { target: 'sphere', abstraction: 0.75 },
    sorrow: { target: 'sphere', abstraction: 0.75 },
    grief: { target: 'sphere', abstraction: 0.8 },
    lonely: { target: 'sphere', abstraction: 0.75 },

    // ── Energy / radiance (starburst) ────────────────────────────────
    joy: { target: 'starburst', abstraction: 0.7 },
    happiness: { target: 'starburst', abstraction: 0.7 },
    energy: { target: 'starburst', abstraction: 0.65 },
    power: { target: 'starburst', abstraction: 0.7 },
    hope: { target: 'starburst', abstraction: 0.75 },
    wonder: { target: 'starburst', abstraction: 0.75 },
    magic: { target: 'starburst', abstraction: 0.8 },

    // ── Beauty / order (ring) ────────────────────────────────────────
    beauty: { target: 'ring', abstraction: 0.7 },
    grace: { target: 'ring', abstraction: 0.7 },
    elegance: { target: 'ring', abstraction: 0.75 },
    perfection: { target: 'ring', abstraction: 0.7 },
    infinity: { target: 'ring', abstraction: 0.85 },
    eternity: { target: 'ring', abstraction: 0.9 },

    // ── Growth / nature (tree) ───────────────────────────────────────
    growth: { target: 'tree', abstraction: 0.7 },
    life: { target: 'tree', abstraction: 0.75 },
    roots: { target: 'tree', abstraction: 0.6 },
    nature: { target: 'tree', abstraction: 0.65 },

    // ── Stability / strength (mountain) ──────────────────────────────
    strength: { target: 'mountain', abstraction: 0.7 },
    solid: { target: 'mountain', abstraction: 0.6 },
    steady: { target: 'mountain', abstraction: 0.65 },
    immovable: { target: 'mountain', abstraction: 0.7 },

    // ── Flow / motion (wave) ─────────────────────────────────────────
    flow: { target: 'wave', abstraction: 0.65 },
    drift: { target: 'wave', abstraction: 0.7 },
    rhythm: { target: 'wave', abstraction: 0.7 },
    breath: { target: 'wave', abstraction: 0.7 },
    pulse: { target: 'wave', abstraction: 0.65 },
};


// ══════════════════════════════════════════════════════════════════════
// TIER 3: ACTION MODIFIERS
// ══════════════════════════════════════════════════════════════════════
// Verbs and adjectives that modify INTENSITY, not shape.
// These multiply the emotionalIntensity of the semantic state:
//   > 1.0 = more energetic, faster, bigger movements
//   < 1.0 = calmer, slower, smaller movements
//   1.0   = neutral (no modification)
//
// Example: "the horse is galloping" → quadruped shape + 1.5x intensity
//          "the horse is sleeping"  → quadruped shape + 0.3x intensity
// ══════════════════════════════════════════════════════════════════════
export const ACTION_MODIFIERS: Record<string, number> = {
    // ── High energy (multiplier > 1.0) ───────────────────────────────
    galloping: 1.5,
    running: 1.3,
    flying: 1.4,
    exploding: 1.8,
    screaming: 1.6,
    smashing: 1.7,
    violent: 1.7,
    crashing: 1.5,
    raging: 1.6,
    wild: 1.4,
    spinning: 1.3,
    roaring: 1.5,
    charging: 1.4,
    leaping: 1.3,
    dancing: 1.2,

    // ── Low energy (multiplier < 1.0) ────────────────────────────────
    floating: 0.6,
    drifting: 0.5,
    sleeping: 0.3,
    gentle: 0.4,
    whisper: 0.3,
    quiet: 0.4,
    slow: 0.5,
    fading: 0.4,
    melting: 0.5,
    resting: 0.3,
    breathing: 0.6,
    gliding: 0.5,
    still: 0.3,
    soft: 0.4,
    silent: 0.3,
};
