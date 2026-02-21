/**
 * sentiment.ts — AFINN-165 lexicon subset for real-time sentiment analysis.
 *
 * WHAT IS AFINN?
 * ──────────────
 * AFINN is a curated list of English words manually scored for sentiment
 * by Finn Årup Nielsen. Each word has an integer score from −5 to +5:
 *   −5 = extremely negative ("bastard", "terrorize")
 *   +5 = extremely positive ("superb", "thrilling")
 *    0 = neutral (not included — why waste space?)
 *
 * WHY A SUBSET?
 * ─────────────
 * The full AFINN-165 has ~3,300 words. We include ~150 of the most
 * commonly spoken words in conversational English. This keeps the bundle
 * small while covering the vast majority of sentiment-carrying speech.
 *
 * HOW IT'S USED:
 * ──────────────
 * The KeywordClassifier sums the raw scores of all recognized words in
 * a transcript, then normalizes to the −1 to +1 range by dividing by
 * the maximum possible magnitude (5). This gives a smooth sentiment
 * gradient that can drive color, physics, or shader parameters.
 *
 * ADDING WORDS:
 * ─────────────
 * Just add a new entry to AFINN_SUBSET. The key is the lowercase word,
 * the value is the raw AFINN score (−5 to +5). The classifier handles
 * normalization automatically.
 */

// ══════════════════════════════════════════════════════════════════════
// AFINN-165 SUBSET
// ══════════════════════════════════════════════════════════════════════
// Raw sentiment scores, −5 (extremely negative) to +5 (extremely positive).
// Words with score 0 are omitted — they don't contribute to sentiment.
//
// Categories are organizational only; the classifier doesn't use them.
// ══════════════════════════════════════════════════════════════════════
export const AFINN_SUBSET: Record<string, number> = {
    // ── Strongly positive (+4 to +5) ─────────────────────────────────
    superb: 5,
    outstanding: 5,
    thrilling: 5,
    breathtaking: 5,
    amazing: 4,
    awesome: 4,
    brilliant: 4,
    excellent: 4,
    fantastic: 4,
    incredible: 4,
    magnificent: 4,
    wonderful: 4,
    spectacular: 4,
    marvelous: 4,

    // ── Moderately positive (+2 to +3) ───────────────────────────────
    love: 3,
    happy: 3,
    beautiful: 3,
    good: 3,
    great: 3,
    joy: 3,
    lovely: 3,
    perfect: 3,
    pleasant: 3,
    smile: 3,
    warm: 2,
    kind: 2,
    like: 2,
    nice: 2,
    fun: 2,
    calm: 2,
    gentle: 2,
    pretty: 2,
    sweet: 2,
    bright: 2,
    cool: 2,
    delight: 3,
    grateful: 3,
    inspire: 3,
    proud: 2,
    safe: 2,
    strong: 2,
    free: 2,
    blessed: 3,
    peaceful: 2,
    magic: 3,
    dream: 2,
    hope: 2,
    win: 2,
    laughing: 2,
    celebrate: 3,
    embrace: 2,
    paradise: 3,
    treasure: 2,
    charm: 2,
    graceful: 3,
    radiant: 3,

    // ── Mildly positive (+1) ─────────────────────────────────────────
    okay: 1,
    fine: 1,
    interesting: 1,
    surprise: 1,
    curious: 1,
    eager: 1,
    wish: 1,

    // ── Mildly negative (−1) ─────────────────────────────────────────
    concern: -1,
    doubt: -1,
    miss: -1,
    weird: -1,
    odd: -1,
    bored: -1,
    tired: -1,
    confused: -1,
    nervous: -1,
    restless: -1,

    // ── Moderately negative (−2 to −3) ───────────────────────────────
    bad: -3,
    sad: -2,
    ugly: -3,
    terrible: -3,
    horrible: -3,
    hate: -3,
    angry: -3,
    pain: -3,
    hurt: -2,
    cry: -2,
    dark: -2,
    fear: -2,
    alone: -2,
    lost: -2,
    broken: -2,
    wrong: -2,
    cold: -2,
    cruel: -3,
    suffer: -3,
    sick: -2,
    lie: -2,
    kill: -3,
    dead: -3,
    death: -3,
    enemy: -2,
    war: -3,
    violent: -3,
    scream: -2,
    dreadful: -3,
    miserable: -3,
    awful: -3,
    disgust: -3,
    anxious: -2,
    desperate: -3,
    grief: -3,
    regret: -2,
    ashamed: -2,
    worthless: -3,
    damage: -2,
    destroy: -3,
    danger: -2,
    toxic: -3,
    nightmare: -3,
    hell: -3,
    curse: -2,

    // ── Strongly negative (−4 to −5) ─────────────────────────────────
    devastating: -4,
    horrific: -4,
    atrocious: -4,
    catastrophe: -4,
    terrorize: -5,
    torture: -4,
    vile: -4,
    abhorrent: -4,
    wretched: -4,
    repulsive: -4,
};

// ══════════════════════════════════════════════════════════════════════
// NORMALIZATION CONSTANT
// ══════════════════════════════════════════════════════════════════════
// The maximum absolute AFINN score is 5. We divide by this to normalize
// individual word scores to the −1 to +1 range. For multi-word
// sentences, the KeywordClassifier averages rather than sums, so
// "happy beautiful day" → (3 + 3 + 0) / 2 = 3 → 3/5 = 0.6
// (only scoring words count toward the average)
// ══════════════════════════════════════════════════════════════════════
export const AFINN_MAX_SCORE = 5;
