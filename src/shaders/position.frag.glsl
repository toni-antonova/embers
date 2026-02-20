void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec4 selfPosition = texture2D(texturePosition, uv);
    vec4 selfVelocity = texture2D(textureVelocity, uv);

    vec3 position = selfPosition.xyz;
    vec3 velocity = selfVelocity.xyz;

    // Euler integration
    // 'delta' is a uniform provided by GPUComputationRenderer automatically? 
    // Actually GPUComputationRenderer doesn't provide 'delta' automatically unless we pass it.
    // But typically we bake delta into velocity or pass it as uniform.
    // For now, let's assume velocity is pixels/frame or we add a uDelta uniform.
    // Standard ShaderMaterial doesn't have delta. We'll add it later.
    // For MVP Prompt 2: simple addition.
    
    position += velocity * 0.016; // Fixed step for now (will be uDelta later)
    gl_FragColor = vec4(position, selfPosition.w);
}
