// Rubber belongs to the road material. Allocate small painted patches only where the tyres slide.
import * as THREE from 'three';

const metres = 8, pixels = 192, layers = 192, density = pixels / metres;
const width = 1024, height = 384, originX = -512, originZ = -100;

export function tyreMarks() {
  const pages = new Uint8Array(width * height);
  const coverage = new Uint8Array(pixels * pixels * layers);
  const index = new THREE.DataTexture(pages, width, height, THREE.RedFormat);
  const rubber = new THREE.DataArrayTexture(coverage, pixels, pixels, layers);
  rubber.format = THREE.RedFormat;
  rubber.minFilter = rubber.magFilter = THREE.LinearFilter;
  rubber.unpackAlignment = 1;
  index.needsUpdate = rubber.needsUpdate = true;
  let used = 0;
  const previous = [null, null];

  function surface(material) {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, { tyrePages: { value: index }, tyreInk: { value: rubber } });
      shader.vertexShader = 'varying vec2 roadPoint;\n' + shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nroadPoint = (modelMatrix * vec4(transformed, 1.0)).xz;');
      shader.fragmentShader = 'varying vec2 roadPoint; uniform sampler2D tyrePages; uniform highp sampler2DArray tyreInk;\n' +
        shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
          vec2 patchUV = roadPoint / ${metres.toFixed(1)};
          ivec2 tile = ivec2(floor(patchUV)) - ivec2(${originX}, ${originZ});
          if (all(greaterThanEqual(tile,ivec2(0))) && all(lessThan(tile,ivec2(${width},${height})))) {
            float layer = texelFetch(tyrePages,tile,0).r * 255.0;
            if (layer > 0.5) {
              float ink = texture(tyreInk, vec3(fract(patchUV),floor(layer+0.5)-1.0)).r;
              diffuseColor.rgb *= mix(vec3(1.0), vec3(0.24,0.22,0.23), ink);
            }
          }`);
    };
    return material;
  }

  function stroke(wheel, x, z, slip) {
    const last = previous[wheel];
    previous[wheel] = { x, z };
    if (!last) return;
    const dx = x - last.x, dz = z - last.z, length = Math.hypot(dx, dz);
    if (length < .006 || length > 4) return;
    const nx = -dz / length, nz = dx / length, radius = .116;
    for (let j = Math.floor((Math.min(last.z,z)-radius)*density); j <= (Math.max(last.z,z)+radius)*density; j++) {
      for (let i = Math.floor((Math.min(last.x,x)-radius)*density); i <= (Math.max(last.x,x)+radius)*density; i++) {
        const px = (i+.5)/density-last.x, pz = (j+.5)/density-last.z;
        const along = (px*dx+pz*dz)/length, across = px*nx+pz*nz, edge = Math.abs(across)/radius;
        if (edge >= 1 || along < -.018 || along > length+.018) continue;
        const tx = Math.floor(i/pixels), tz = Math.floor(j/pixels);
        if (tx < originX || tx >= originX+width || tz < originZ || tz >= originZ+height) continue;
        const page = (tz-originZ)*width + tx-originX;
        if (!pages[page]) {
          if (used >= layers) continue;
          coverage.fill(0, used*pixels*pixels, (used+1)*pixels*pixels);
          pages[page] = ++used; index.needsUpdate = true;
        }
        const layer = pages[page]-1, offset = (layer*pixels + j-tz*pixels)*pixels + i-tx*pixels;
        const grit = ((Math.imul(i,73856093)^Math.imul(j,19349663))>>>0) % 37 / 100;
        const groove = .80 + .20*Math.cos(across*144);
        const pressure = Math.min(.93,slip*.9) * Math.min(1,(1-edge)*4) * groove;
        coverage[offset] = Math.max(coverage[offset],Math.round(255*pressure*(.65+grit)));
        rubber.addLayerUpdate(layer);
      }
    }
    if (rubber.layerUpdates.size) rubber.needsUpdate = true;
  }
  function lift() { previous.fill(null); }
  function clear() { lift(); used = 0; pages.fill(0); index.needsUpdate = true; }
  return { surface, stroke, lift, clear };
}
