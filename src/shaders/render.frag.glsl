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
// ═══════════════════════════════════════════════════════════════════════

uniform vec3 uColor;   // Particle color (set by UniformBridge based on tension)
uniform float uAlpha;   // Overall opacity multiplier

void main() {
    // Distance from center of the point quad (0.5, 0.5)
    float dist = length(gl_PointCoord - vec2(0.5));

    // Discard pixels outside the circle (turns square quad into circle)
    if (dist > 0.5) discard;

    // Core: bright center, fades by distance 0.15 from center
    // This creates the sharp inner dot
    float core = 1.0 - smoothstep(0.0, 0.15, dist);

    // Glow: wider halo, fades from 0.1 to 0.5 from center
    // This creates the soft outer glow
    float glow = 1.0 - smoothstep(0.1, 0.5, dist);

    // Combine: core contributes 80% brightness, glow 40%
    float alpha = (core * 0.8 + glow * 0.4) * uAlpha;

    // Discard nearly-invisible fragments for performance
    if (alpha < 0.01) discard;

    // Color modulation: core area is full brightness (core*0.5+0.5),
    // outer glow area is dimmer. This gives a natural light falloff.
    gl_FragColor = vec4(uColor * (core * 0.5 + 0.5), alpha);
}

