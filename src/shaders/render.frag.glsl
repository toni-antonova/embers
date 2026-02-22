// ═══════════════════════════════════════════════════════════════════════
// RENDER FRAGMENT SHADER — Controls how each particle dot looks.
//
// Each particle is rendered as a gl.POINTS primitive, so the GPU gives
// us a square quad for each point. gl_PointCoord lets us know where
// we are within that quad (0,0 = top-left, 1,1 = bottom-right).
//
// We create a soft, star-like glow by combining two layers:
// - A bright "core" that fades quickly (the dot's center)
// - A wider "glow" that fades gradually (the soft halo)
// This makes particles look like luminous points rather than hard discs.
//
// COLOR MODES:
//   White (0): Subtle tension-driven warm↔cool tint on white base.
//   Color (1): Sentiment-driven monotone coloring.
//     - Happy (positive sentiment)     → yellow-orange
//     - Sad   (negative, low intensity) → blue
//     - Angry (negative, high intensity)→ red
//     - Neutral                         → soft warm white
//     Base hue shifts with per-particle variation for organic feel.
// ═══════════════════════════════════════════════════════════════════════

uniform vec3 uColor;        // Base particle color (fallback)
uniform float uAlpha;       // Overall opacity multiplier
uniform float uColorMode;   // 0.0 = white/tension, 1.0 = color (sentiment)
uniform float uTime;        // Animation time for subtle hue drift
uniform float uRolloff;     // Spectral rolloff → edge softness (0=soft, 1=crisp)

// Color channel uniforms
uniform float uTension;     // 0–1, from spectral centroid (0=relaxed, 1=tense)
uniform float uSentiment;   // −1 to +1, from keyword classifier
uniform float uEnergy;      // 0–1, from RMS
uniform float uEmotionalIntensity; // 0–1, from classifier (high = angry, low = sad)

varying vec2 vUV;           // Per-particle UV from vertex shader

// ── HSL → RGB CONVERSION ─────────────────────────────────────────────
vec3 hsl2rgb(float h, float s, float l) {
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float hp = h * 6.0;
    float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
    float m = l - c * 0.5;

    vec3 rgb;
    if      (hp < 1.0) rgb = vec3(c, x, 0.0);
    else if (hp < 2.0) rgb = vec3(x, c, 0.0);
    else if (hp < 3.0) rgb = vec3(0.0, c, x);
    else if (hp < 4.0) rgb = vec3(0.0, x, c);
    else if (hp < 5.0) rgb = vec3(x, 0.0, c);
    else               rgb = vec3(c, 0.0, x);

    return rgb + m;
}

void main() {
    // Distance from center of the point quad (0.5, 0.5)
    float dist = length(gl_PointCoord - vec2(0.5));

    // Discard pixels outside the circle (turns square quad into circle)
    if (dist > 0.5) discard;

    // ── ROLLOFF → EDGE SOFTNESS ───────────────────────────────────
    float edgeSoftness = mix(0.45, 0.15, uRolloff);
    float core = 1.0 - smoothstep(0.0, edgeSoftness, dist);
    float glow = 1.0 - smoothstep(edgeSoftness * 0.67, 0.5, dist);
    float alpha = (core * 0.8 + glow * 0.4) * uAlpha;
    if (alpha < 0.01) discard;

    // ── COLOR SYSTEM ──────────────────────────────────────────────
    vec3 finalColor;

    if (uColorMode > 0.5) {
        // ── COLOR MODE: Sentiment-driven monotone coloring ────────
        //
        // Determine the emotional hue:
        //   Happy  (sentiment > 0):  hue ~0.10 (yellow-orange)
        //   Sad    (sentiment < 0, low intensity):  hue ~0.60 (blue)
        //   Angry  (sentiment < 0, high intensity): hue ~0.00 (red)
        //   Neutral: hue ~0.08 (warm white-ish)

        float sentAbs = abs(uSentiment);
        float hue;
        float sat;
        float lit;

        if (uSentiment > 0.05) {
            // HAPPY: yellow-orange
            hue = 0.10;  // ~36° yellow-orange
            sat = 0.7 * sentAbs;
            lit = 0.65 + sentAbs * 0.1;
        } else if (uSentiment < -0.05) {
            // NEGATIVE: blend between blue (sad) and red (angry) by intensity
            float sadHue = 0.60;   // 216° blue
            float angryHue = 0.0;  // 0° red
            hue = mix(sadHue, angryHue, uEmotionalIntensity);
            sat = 0.6 * sentAbs;
            lit = 0.55 + sentAbs * 0.1;
        } else {
            // NEUTRAL: soft warm white
            hue = 0.08;
            sat = 0.05;
            lit = 0.75;
        }

        // Per-particle hue variation for organic feel (very subtle ±0.03)
        float hueVariation = (vUV.x * 0.37 + vUV.y * 0.23 + uTime * 0.02);
        hue += (fract(hueVariation) - 0.5) * 0.06;

        finalColor = hsl2rgb(fract(hue), sat, lit);
    } else {
        // ── WHITE MODE: tension-driven warm ↔ cool baseline ───────
        vec3 warmBase = vec3(1.0, 0.95, 0.88);    // slightly golden
        vec3 coolBase = vec3(0.88, 0.93, 1.0);     // slightly icy
        finalColor = mix(warmBase, coolBase, uTension);

        // Subtle sentiment overlay in white mode too (max 15%)
        float sentStrength = abs(uSentiment) * 0.15;
        vec3 sentShift = uSentiment > 0.0
            ? vec3(1.0, 0.97, 0.9)    // positive = warm
            : vec3(0.9, 0.93, 1.0);   // negative = cool
        finalColor = mix(finalColor, sentShift, sentStrength);
    }

    // ── ENERGY GLOW (both modes) ──────────────────────────────────
    // Louder voice = brighter particles (up to 30% boost)
    float energyGlow = 1.0 + uEnergy * 0.3;
    finalColor *= energyGlow;

    // Color modulation: core area full brightness, outer glow dimmer
    gl_FragColor = vec4(finalColor * (core * 0.5 + 0.5), alpha);
}
