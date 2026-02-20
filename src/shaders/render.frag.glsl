uniform vec3 uColor;
uniform float uAlpha;

void main() {
    float dist = length(gl_PointCoord - vec2(0.5));
    if (dist > 0.5) discard;
    
    // Soft falloff
    float alpha = 1.0 - smoothstep(0.3, 0.5, dist);
    alpha *= uAlpha;
    
    if (alpha < 0.01) discard;
    
    gl_FragColor = vec4(uColor, alpha);
}
