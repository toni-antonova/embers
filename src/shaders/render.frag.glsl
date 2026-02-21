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
// - White: particles use uColor (set by UniformBridge, subtle tension tint)
// - Rainbow: particles cycle through HSL hues based on time + UV position,
//   giving each particle a unique hue that shifts over time.
// ═══════════════════════════════════════════════════════════════════════

uniform vec3 uColor;        // Base particle color (set by UniformBridge)
uniform float uAlpha;       // Overall opacity multiplier
uniform float uColorMode;   // 0.0 = white/tension, 1.0 = rainbow
uniform float uTime;        // Animation time for rainbow cycling
uniform float uRolloff;     // Spectral rolloff → edge softness (0=soft, 1=crisp)

varying vec2 vUV;           // Per-particle UV from vertex shader

// ── HSL → RGB CONVERSION ─────────────────────────────────────────────
// Standard HSL to RGB, needed because GLSL only works in RGB space.
// H, S, L are all in [0, 1] range.
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
    // High rolloff (bright/crisp voice) = tight core, sharp edges
    // Low rolloff (muffled/warm voice) = diffuse glow, soft edges
    float edgeSoftness = mix(0.45, 0.15, uRolloff);

    // Core: bright center, fades by edge softness from center
    float core = 1.0 - smoothstep(0.0, edgeSoftness, dist);

    // Glow: wider halo, fades from edge softness to 0.5
    float glow = 1.0 - smoothstep(edgeSoftness * 0.67, 0.5, dist);

    // Combine: core contributes 80% brightness, glow 40%
    float alpha = (core * 0.8 + glow * 0.4) * uAlpha;

    // Discard nearly-invisible fragments for performance
    if (alpha < 0.01) discard;

    // ── COLOR SELECTION ───────────────────────────────────────────
    vec3 finalColor;
    if (uColorMode > 0.5) {
        // RAINBOW MODE: each particle gets a unique hue based on its UV
        // position (angle around the formation), shifting over time.
        // - vUV.x + vUV.y creates angular variation across the grid
        // - uTime * 0.15 makes the rainbow slowly rotate
        // - Saturation 0.85 and lightness 0.6 give vivid, bright colors
        float hue = fract(vUV.x + vUV.y * 0.5 + uTime * 0.15);
        finalColor = hsl2rgb(hue, 0.85, 0.6);
    } else {
        // WHITE MODE: use uColor from UniformBridge (tension-tinted white)
        finalColor = uColor;
    }

    // Color modulation: core area is full brightness (core*0.5+0.5),
    // outer glow area is dimmer. This gives a natural light falloff.
    gl_FragColor = vec4(finalColor * (core * 0.5 + 0.5), alpha);
}

