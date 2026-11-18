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

// World-space lengths and crossing directions keep the surface continuous across canal polygons.
const waterTime = { value: 0 };
export function waterWaves(shader, clock = waterTime) {
  shader.uniforms.waterClock = clock;
  shader.vertexShader = 'varying vec3 waterPosition;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nwaterPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  shader.fragmentShader = `
    uniform float waterClock;
    varying vec3 waterPosition;
    vec2 waterSlope(vec2 direction, float phase, float strength) {
      float filterWidth = fwidth(phase);
      return direction * (strength * cos(phase) / (1.0 + filterWidth * filterWidth));
    }
  ` + shader.fragmentShader.replace('#include <normal_fragment_maps>', `
    #include <normal_fragment_maps>
    vec2 p = waterPosition.xz;
    float t = waterClock;
    float bend = sin(dot(p, vec2(.12,.079)) - .20*t) + .53*sin(dot(p,vec2(-.08,.15)) + .13*t);
    vec2 slope = waterSlope(vec2(.88,.47), dot(p,vec2(1.53,.81)) - 1.12*t + bend, .066);
    slope += waterSlope(vec2(-.41,.91),dot(p,vec2(-1.27,2.83)) + 1.39*t - .85*bend, .052);
    float gust = .63 + .37*sin(dot(p,vec2(.19,-.13)) - .32*t);
    slope += gust * waterSlope(vec2(.25,.97),dot(p,vec2(1.45,5.61)) - 1.9*t + 1.6*bend, .042);
    slope += gust * waterSlope(vec2(-.65,.76),dot(p,vec2(-5.05,5.91)) + 2.15*t - .9*bend, .033);
    float chop = sin(dot(p,vec2(1.91,-.82)) + t*.53) + .45*sin(dot(p,vec2(-2.2,1.23)) - t*.72);
    slope += waterSlope(vec2(.77,.63),dot(p,vec2(9.86,8.07)) - t*2.61 + 1.4*chop, .047);
    slope += gust*waterSlope(vec2(-.19,.98),dot(p,vec2(-4.4,22.7)) + t*3.03 - .8*chop, .031);
    normal = normalize(mat3(viewMatrix) * vec3(-slope.x, 1.0, -slope.y));
  `);
}

// A one-time distance field takes the reflected ray to the actual nearest facade. Empty texels
// inherit its colour/height, so interpolating coverage can never create black squares at walls.
export function canalReflections(material, rect) {
  const size = 1024, scale = 64, meterX = (rect[2] - rect[0]) / size, meterZ = (rect[3] - rect[1]) / size;
  const makeLayer = () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(1 / meterX, 0, 0, 1 / meterZ, -rect[0] / meterX, -rect[1] / meterZ);
    return ctx;
  };
  const ink = makeLayer(), heights = makeLayer(), detail = { value: true }, time = waterTime;
  let textures;
  function rasterize() {
    const raw = ink.getImageData(0, 0, size, size).data, levels = heights.getImageData(0, 0, size, size).data;
    const count = size * size, from = new Int32Array(count), dist = new Float32Array(count);
    for (let i = 0; i < count; i++) { const filled = raw[i * 4 + 3] > 110; from[i] = filled ? i : -1; dist[i] = filled ? 0 : 1e5; }
    const diag = Math.hypot(meterX, meterZ);
    for (const step of [1, -1]) {
      const first = step > 0 ? 0 : size - 1;
      for (let y = first; y >= 0 && y < size; y += step) for (let x = first; x >= 0 && x < size; x += step) {
        const i = y * size + x, ox = x - step, oy = y - step;
        if (dist[i] === 0) continue;
        if (ox >= 0 && ox < size && dist[i - step] + meterX < dist[i]) { dist[i] = dist[i - step] + meterX; from[i] = from[i - step]; }
        if (oy < 0 || oy >= size) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (x + dx < 0 || x + dx >= size) continue;
          const j = oy * size + x + dx, d = dist[j] + (dx ? diag : meterZ);
          if (d < dist[i]) { dist[i] = d; from[i] = from[j]; }
        }
      }
    }
    const rgba = new Uint8Array(count * 4), distance = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      const k = Math.max(0, from[i]) * 4, j = i * 4;
      rgba[j] = raw[k]; rgba[j + 1] = raw[k + 1]; rgba[j + 2] = raw[k + 2]; rgba[j + 3] = levels[k];
      distance[i] = Math.min(255, Math.round(dist[i] * 4));
    }
    const texture = (data, format) => {
      const map = new THREE.DataTexture(data, size, size, format);
      map.minFilter = map.magFilter = THREE.LinearFilter; map.needsUpdate = true; return map;
    };
    return [texture(rgba, THREE.RGBAFormat), texture(distance, THREE.RedFormat)];
  }
  material.onBeforeCompile = (shader) => {
    waterWaves(shader, time);
    const [banks, distance] = textures ||= rasterize();
    Object.assign(shader.uniforms, { bankAtlas: { value: banks }, shoreDistance: { value: distance }, bankRect: { value: new THREE.Vector4(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]) }, bankDetail: detail });
    shader.fragmentShader = 'uniform sampler2D bankAtlas, shoreDistance; uniform vec4 bankRect; uniform bool bankDetail;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 ray = reflect(normalize(-vViewPosition), normal) * mat3(viewMatrix);
      float grazing = pow(1.-clamp(ray.y,0.,1.), 2.);
      // The painted lighting probe contains silhouettes for glossy vehicles. Water sees the
      // open sky plus the separate local bank field, reflected over olive-brown canal water.
      vec3 sky = mix(vec3(.37,.47,.50),vec3(.13,.31,.48),smoothstep(.02,.85,ray.y));
      vec3 body = mix(vec3(.049,.085,.061), min(outgoingLight,vec3(.27)), .25);
      outgoingLight = mix(body, sky, .22 + .49*grazing);
      float glint = max(0.,dot(ray, normalize(vec3(-105.,118.,96.))));
      outgoingLight += vec3(.66,.54,.36)*pow(glint, 96.);
      if (bankDetail) {
        float horizontal = length(ray.xz), run = 0.0;
        for (int i = 0; i < 13; i++) {
          if (horizontal < .05 || run > 90.) break;
          vec3 at = waterPosition + ray * (run / max(.05, horizontal));
          vec2 uv = (at.xz - bankRect.xy) / bankRect.zw;
          if (any(lessThan(uv,vec2(0))) || any(greaterThan(uv,vec2(1)))) break;
          float d = texture2D(shoreDistance, uv).r * 63.75;
          if (d < 2.0) {
            vec4 bank = texture2D(bankAtlas, uv);
            float top = bank.a * ${scale.toFixed(1)}, roofFade = smoothstep(-.40,1.10,top-at.y);
            if (roofFade > .001) {
              vec3 brick = pow(bank.rgb, vec3(2.2));
              float bay = cos(at.x*1.52 + at.z*2.12), row = cos(at.y*2.10);
              float windows = smoothstep(-.23,.26,bay)*smoothstep(-.34,.20,row);
              vec3 facade = mix(brick,vec3(.095,.16,.16),.48*windows);
              float fresnel = .22 + .36*grazing;
              outgoingLight = mix(outgoingLight, .76*facade + vec3(.026,.045,.036), fresnel*roofFade);
              break;
            }
          }
          run += max(2.35, d * .82);
        }
      }
      // Wave faces turn alternately towards pale sky and the darker bank. Filtered micro-chop
      // breaks up broad bands while distant ripples fade into a continuous reflection.
      float face = dot(slope,vec2(-.77,.64));
      outgoingLight *= 1.0 + 1.05 * clamp(face,-.20,.20);
      outgoingLight += vec3(.044,.055,.056) * smoothstep(.04,.18,face);
      #include <opaque_fragment>`);
  };
  return {
    paint(outline, height, color) {
      const path = new Path2D(); path.moveTo(outline[0], outline[1]);
      for (let i = 2; i < outline.length; i += 2) path.lineTo(outline[i], outline[i + 1]);
      path.closePath(); ink.fillStyle = color; ink.fill(path);
      const h = Math.min(255, Math.round(height / scale * 255)); heights.fillStyle = `rgb(${h},${h},${h})`; heights.fill(path);
    },
    setTime(t) { time.value = t; },
    setDetail(on) { detail.value = on; },
  };
}
