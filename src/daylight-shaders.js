import { ShaderChunk } from 'three';

// The one point light is reserved for the fireworks stall. Keep its compiled
// variant ready for the flash while skipping its BRDF whenever its radiance is zero.
ShaderChunk.lights_fragment_begin = ShaderChunk.lights_fragment_begin
  .replace('pointLight = pointLights[ i ];', '$&\n\t\tif (any(notEqual(pointLight.color, vec3(0.0)))) {')
  .replace(/(pointLight = pointLights\[ i \];[\s\S]*?RE_Direct\([^;]+;)/, '$1\n\t\t}');

// The five PCF taps share the same per-pixel rotation. Precompute the disk in
// its local frame; rotate it once rather than evaluating five angle pairs.
ShaderChunk.shadowmap_pars_fragment = ShaderChunk.shadowmap_pars_fragment
  .replace('float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;', `$&
    vec2 axis = vec2(cos(phi),sin(phi));
    mat2 diskRotation = mat2(axis, vec2(-axis.y,axis.x));`)
  .replace(/vogelDiskSample\( ([0-4]), 5, phi \)/g, (_, tap) => {
    const angle=Number(tap)*2.399963229728653, radius=Math.sqrt((Number(tap)+.5)/5);
    return '(diskRotation * vec2('+(radius*Math.cos(angle)).toFixed(10)+','+(radius*Math.sin(angle)).toFixed(10)+'))';
  });
