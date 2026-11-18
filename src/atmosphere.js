// Painted daylight for the visible sky and the highlights on polished objects.
import * as THREE from 'three';

export const sunOffset = [-105, 118, 96];

export function daylight() {
  const w = 1024, h = 512, sky = document.createElement('canvas');
  sky.width = w; sky.height = h;
  const g = sky.getContext('2d');
  const gradient = g.createLinearGradient(0, 0, 0, h);
  for (const [stop, color] of [[0, '#1749a9'], [0.25, '#1266c7'], [0.41, '#4398e4'], [0.48, '#a5d5f5'], [0.5, '#cfe8fb'], [1, '#cfe8fb']]) gradient.addColorStop(stop, color);
  g.fillStyle = gradient; g.fillRect(0, 0, w, h);

  // Fine, broken cirrus above the solid banks of cumulus. The periodic strokes wrap at the panorama seam.
  for (let i = 0; i < 82; i++) {
    const t = i * 0.618033989 % 1, a = i * 2.39996, x = w * t;
    const y = 98 + 25 * Math.sin(t * Math.PI * 4) + 17 * Math.cos(a), len = 25 + 56 * (i % 7) / 6;
    g.lineWidth = 0.8 + (i % 5) * 0.5; g.lineCap = 'round'; g.strokeStyle = 'rgba(236,247,255,0.12)';
    for (const dx of [-w, 0, w]) { g.beginPath(); g.moveTo(x + dx, y); g.bezierCurveTo(x + dx + len * 0.25, y + 1, x + dx + len * 0.7, y - 7, x + dx + len, y - 14); g.stroke(); }
  }
  const d = new THREE.Vector3(...sunOffset).normalize();
  const x = w * (0.5 + Math.atan2(d.z, d.x) / (2 * Math.PI)), y = h * (0.5 - Math.asin(d.y) / Math.PI);
  g.save(); g.translate(x, y); g.scale(1 / Math.sqrt(1 - d.y * d.y), 1);
  const halo = g.createRadialGradient(0, 0, 0, 0, 0, 47);
  for (const [stop, color] of [[0, '#fff7d9'], [0.045, '#ffefd1'], [0.065, 'rgba(255,241,198,.62)'], [0.23, 'rgba(255,242,203,.20)'], [1, 'rgba(255,246,217,0)']]) halo.addColorStop(stop, color);
  g.fillStyle = halo; g.fillRect(-47, -47, 94, 94); g.restore();

  const panorama = (canvas) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping; texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  };
  const skyMap = panorama(sky);
  const probe = document.createElement('canvas'); probe.width = w; probe.height = h;
  const p = probe.getContext('2d'); p.drawImage(sky, 0, 0);
  // A soft ground return and broad light/dark shapes make the curvature of varnish, glass and alloy legible.
  const ground = p.createLinearGradient(0, h / 2 - 5, 0, h);
  ground.addColorStop(0, '#a8b8ae'); ground.addColorStop(0.14, '#827c68'); ground.addColorStop(1, '#525c58');
  p.fillStyle = ground; p.fillRect(0, h / 2 - 5, w, h / 2 + 5);
  for (let i = 0; i < 32; i++) {
    const bx = i * 32, height = 4 + (i * 17 % 19), base = h / 2 + 2;
    p.fillStyle = ['#677879', '#85887c', '#647570', '#919082'][i % 4];
    p.beginPath(); p.moveTo(bx, base); p.lineTo(bx, base - height * 0.6); p.lineTo(bx + 13, base - height); p.lineTo(bx + 30, base - height * 0.6); p.lineTo(bx + 30, base); p.fill();
  }
  return { sky: skyMap, reflection: panorama(probe) };
}

// Rasterize the actual house outlines once. A reflected view ray on the canal can then find
// the opposite bank without rendering the scene a second time.
export function canalReflections(material, rect) {
  const size = 1024, heightScale = 68, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'), sx = size / (rect[2] - rect[0]), sz = size / (rect[3] - rect[1]);
  ctx.setTransform(sx, 0, 0, sz, -sx * rect[0], -sz * rect[1]);
  const banks = new THREE.CanvasTexture(canvas);
  banks.flipY = false; banks.generateMipmaps = false; banks.minFilter = banks.magFilter = THREE.NearestFilter;
  const detail = { value: true };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { bankAtlas: { value: banks }, bankRect: { value: new THREE.Vector4(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]) }, bankDetail: detail });
    shader.vertexShader = 'varying vec3 canalPosition;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ncanalPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = 'uniform sampler2D bankAtlas; uniform vec4 bankRect; uniform bool bankDetail; varying vec3 canalPosition;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', `
      if (bankDetail) {
        vec3 ray = reflect(normalize(-vViewPosition), normal) * mat3(viewMatrix);
        float reach = 2.0;
        for (int i = 0; i < 11; i++) {
          vec3 at = canalPosition + ray * reach;
          vec2 uv = (at.xz - bankRect.xy) / bankRect.zw;
          if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) break;
          vec4 bank = texture2D(bankAtlas, uv);
          float top = bank.a * ${heightScale.toFixed(1)};
          if (top > 1.0 && at.y < top) {
            vec3 brick = pow(bank.rgb, vec3(2.2));
            float row = fract(at.y / 3.0);
            float pane = smoothstep(0.12,0.25,row) * (1.0-smoothstep(0.68,0.82,row));
            float bay = sin(dot(at.xz, vec2(1.19,1.65)));
            vec3 bankLight = mix(brick, vec3(0.13,0.22,0.28), 0.52 * pane * smoothstep(0.0,0.48,bay));
            float strength = (0.16 + 0.40 * pow(1.0 - clamp(ray.y,0.0,1.0),2.0)) * smoothstep(0.0,2.2,top-at.y);
            outgoingLight = mix(outgoingLight, bankLight * 0.82 + vec3(0.035,0.09,0.12), strength);
            break;
          }
          reach = reach * 1.30 + 1.65;
        }
      }
      #include <opaque_fragment>`);
  };
  return {
    paint(outline, height, color) {
      ctx.globalAlpha = Math.min(height / heightScale, 1);
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(outline[0], outline[1]);
      for (let i = 2; i < outline.length; i += 2) ctx.lineTo(outline[i], outline[i + 1]);
      ctx.closePath(); ctx.fill();
    },
    setDetail(on) { detail.value = on; },
  };
}
