// The cast: the lesson car, Nikki, the examiner, cyclists, parked cars, cheese carriers, the crowd,
// plus tyre smoke, skid marks and confetti. Everything faces local +x, with its right side on +z.
import * as THREE from 'three';
import { mat, canvasTex, GROUND, bikeGeo, fuse } from './world.js';
import { clamp, lerp, smooth } from './drive.js';
import { berrieGeo, cheeseWheelGeo, duckGeo, rondvaartboot } from './landmarks.js';

const { PI, sin, cos, random, hypot, atan2, abs } = Math;
const ramp = (t, a, b) => smooth((t - a) / (b - a));
const tex = (w, h, draw) => canvasTex(w, h, draw, false);
export const FONT = '"Lilita One", "Arial Black", sans-serif';
const pick = (a, i) => a[((i % a.length) + a.length) % a.length];

// ---------- people (blocky, Roblox-style) ----------
const HEAD = new THREE.LatheGeometry([[0, -0.18], [0.16, -0.18], [0.2, -0.14], [0.2, 0.14], [0.16, 0.18], [0, 0.18]].map(([x, y]) => new THREE.Vector2(x, y)), 20);
const FACE = new THREE.CylinderGeometry(0.203, 0.203, 0.32, 16, 1, true, PI / 2 - 0.8, 1.6); // wraps the front of the head

const HAIR = new THREE.SphereGeometry(0.213, 14, 6, 0, PI * 2, 0, PI / 2);
const FACES = {}; // three simple drawn faces for everyone who is not a star: 'smile', 'grin', 'o'
const plainFace = (kind) => FACES[kind] ??= tex(128, 128, (g) => {
  g.fillStyle = '#1b1b1b'; for (const x of [42, 86]) { g.beginPath(); g.ellipse(x, 52, 7, kind === 'o' ? 10 : 8, 0, 0, 7); g.fill(); }
  g.strokeStyle = g.fillStyle = '#3a1418'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath();
  if (kind === 'o') { g.ellipse(64, 96, 10, 13, 0, 0, 7); g.fill(); }
  else if (kind === 'grin') { g.moveTo(40, 84); g.quadraticCurveTo(64, 118, 88, 84); g.closePath(); g.fillStyle = '#ffffff'; g.fill(); g.stroke(); }
  else { g.arc(64, 76, 24, 0.5, PI - 0.5); g.stroke(); }
});

// Moulded edges stay inside the original box. Side panels retain the box UVs for the clothing prints.
const mouldCache = new Map();
function mould(w, h, d, bevel) {
  const key = [w, h, d, bevel].join('/');
  if (mouldCache.has(key)) return mouldCache.get(key);
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3), p = g.attributes.position, n = g.attributes.normal;
  const v = new THREE.Vector3(), core = new THREE.Vector3(), face = new THREE.Vector3();
  const edge = (q, size) => Math.abs(q) < size * 0.4 ? Math.sign(q) * (size / 2 - bevel) : q;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); v.set(edge(v.x, w), edge(v.y, h), edge(v.z, d)); face.fromBufferAttribute(n, i);
    core.set(clamp(v.x, bevel - w / 2, w / 2 - bevel), clamp(v.y, bevel - h / 2, h / 2 - bevel), clamp(v.z, bevel - d / 2, d / 2 - bevel));
    v.sub(core).normalize();
    // Retain broad flat faces; the bevel reaches its full size in the middle of each edge.
    p.setXYZ(i, core.x + bevel * v.x, core.y + bevel * v.y, core.z + bevel * v.z);
    face.lerp(v, 0.46).normalize(); n.setXYZ(i, face.x, face.y, face.z);
  }
  mouldCache.set(key, g); return g;
}
const moulded = (w, h, d, r, material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(mould(w, h, d, r), material); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
};

let knit;
function shirtPrint() {
  return knit ??= tex(128, 128, (g) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#e1e0df'; g.fillRect(0, 114, 128, 4);
    g.strokeStyle = '#c8cbca'; g.lineWidth = 3; g.beginPath();
    g.moveTo(69, 42); g.lineTo(101, 42); g.lineTo(99, 64); g.lineTo(85, 72); g.lineTo(71, 64); g.closePath(); g.stroke();
    g.strokeStyle = '#eee'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 12); g.lineTo(25, 23); g.lineTo(44, 13);
    g.moveTo(128, 12); g.lineTo(104, 23); g.lineTo(86, 13); g.stroke();
    g.fillStyle = '#d5d5d0'; for (const y of [28, 39, 50]) { g.beginPath(); g.arc(57, y, 2, 0, 2 * PI); g.fill(); }
  });
}
// Print onto the front face only. The remaining faces sample a white swatch of the same print.
let torsoGeo;
function shirtBody(shirt) {
  if (!torsoGeo) {
    torsoGeo = mould(0.26, 0.52, 0.5, 0.03).clone();
    const uv = torsoGeo.attributes.uv;
    for (let i = 16; i < uv.count; i++) uv.setXY(i, 0.04, 0.96);
  }
  const torso = new THREE.Mesh(torsoGeo, mat(shirt, { map: shirtPrint(), roughness: 0.87 }));
  torso.position.y = 0.26; torso.castShadow = torso.receiveShadow = true; return torso;
}

// face: a texture, or the name of a plain face. hair: a colour, or null for someone who brings their own (or a helmet).
export function person(b, { skin = '#f0c8a0', shirt = '#3d7dca', pants = '#2d3142', sleeve = shirt, face = 'smile', hair = '#4a3526', shoes = '#23252b', collar = '#ffffff' } = {}) {
  const g = new THREE.Group(), head = new THREE.Group(); head.position.y = 0.73;
  const skull = new THREE.Mesh(HEAD, mat(skin, { roughness: 0.6 })); skull.castShadow = true; head.add(skull, b(0.05, 0.09, 0.03, skin, 0, 0, -0.205), b(0.05, 0.09, 0.03, skin, 0, 0, 0.205));
  const faceMat = new THREE.MeshStandardMaterial({ map: typeof face === 'string' ? plainFace(face) : face, alphaTest: 0.45, roughness: 0.6 });
  head.add(new THREE.Mesh(FACE, faceMat));
  if (hair) { const top = new THREE.Mesh(HAIR, mat(hair, { roughness: 0.9 })); top.scale.y = 0.55; top.position.y = 0.12; head.add(top, b(0.06, 0.2, 0.36, hair, -0.19, 0.06, 0)); }
  const cloth = mat(pants, { roughness: 0.92 }), cuff = mat(sleeve, { roughness: 0.83 }), hand = mat(skin, { roughness: 0.63 }), shoe = mat(shoes, { roughness: 0.48 });
  const arm = (z) => {
    const p = new THREE.Group(); p.position.set(0, 0.47, z);
    p.add(moulded(0.15, 0.4, 0.15, 0.025, cuff, 0, -0.15, 0), moulded(0.15, 0.1, 0.15, 0.032, hand, 0, -0.4, 0)); return p;
  };
  const leg = (z) => {
    const p = new THREE.Group(); p.position.set(0, 0, z);
    p.add(moulded(0.2, 0.46, 0.22, 0.02, cloth, 0, -0.23, 0), moulded(0.28, 0.1, 0.25, 0.022, shoe, 0.04, -0.51, 0)); return p;
  };
  const o = { g, head, faceMat, armL: arm(-0.33), armR: arm(0.33), legL: leg(-0.13), legR: leg(0.13) };
  g.add(shirtBody(shirt), moulded(0.2, 0.05, 0.34, 0.016, mat(collar), 0, 0.535, 0), head, o.armL, o.armR, o.legL, o.legR);
  return o;
}
const sit = (p, k = 1) => { p.legL.rotation.z = p.legR.rotation.z = (PI / 2) * k; };

// Nikki's face: the dark features of her avatar photo, lifted off the skin
function nikkiFace() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const img = new Image();
  img.onload = () => {
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 512, 512);
    const d = g.getImageData(0, 0, 512, 512), a = d.data;
    for (let i = 0; i < a.length; i += 4) { const lum = 0.3 * a[i] + 0.59 * a[i + 1] + 0.11 * a[i + 2]; a[i] = 22; a[i + 1] = 16; a[i + 2] = 16; a[i + 3] = clamp((100 - lum) / 40, 0, 1) * 255; }
    g.putImageData(d, 0, 0); t.needsUpdate = true;
  };
  img.src = 'assets/nikki-face.png';
  return t;
}

// the examiner's moods, drawn by hand; `open` is the same face mid-word
function examinerFace(kind, open) {
  return tex(256, 256, (g) => {
    g.lineCap = g.lineJoin = 'round';
    const line = (pts, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
    const disc = (x, y, r, col, ry = r) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, r, ry, 0, 0, 7); g.fill(); };
    const scared = kind === 'scream' || kind === 'nervous', shut = kind === 'pray';
    for (const x of [84, 172]) {
      disc(x, 102, 31, '#ffffff');
      if (kind === 'dazed') { g.strokeStyle = '#222'; g.lineWidth = 5; g.beginPath(); for (let a = 0; a < 15; a += 0.2) g.lineTo(x + cos(a) * a * 1.7, 102 + sin(a) * a * 1.7); g.stroke(); }
      else if (shut) { g.strokeStyle = '#1b1b1b'; g.lineWidth = 6; g.beginPath(); g.arc(x, 96, 15, 0.35, PI - 0.35); g.stroke(); }
      else disc(x, kind === 'scream' ? 98 : 104, { calm: 9, nervous: 6, scream: 4, angry: 7 }[kind], '#1b1b1b');
      g.strokeStyle = '#2a2a2a'; g.lineWidth = 8; g.beginPath(); g.arc(x, 102, 34, 0, 7); g.stroke();
    }
    line([[118, 100], [138, 100]], 8, '#2a2a2a');
    const lift = { calm: 0, nervous: 10, scream: 22, dazed: -4, angry: 0, pray: 14 }[kind];
    if (kind === 'angry') { line([[50, 34], [112, 64]], 12, '#8d9099'); line([[144, 64], [206, 34]], 12, '#8d9099'); }
    else { line([[54, 58 - (scared ? 0 : lift)], [110, 50 - lift]], 10, '#8d9099'); line([[146, 50 - lift], [202, 58 - (scared ? 0 : lift)]], 10, '#8d9099'); }
    if (kind === 'scream') { disc(128, 208, 36, '#3a1418', 34); disc(128, 226, 20, '#e2687a', 12); }
    else if (kind === 'angry') { disc(128, 208, open ? 34 : 30, '#3a1418', open ? 26 : 15); g.fillStyle = '#ffffff'; g.fillRect(106, open ? 186 : 195, 44, 8); line([[214, 30], [234, 50]], 6, '#e0202a'); line([[234, 30], [214, 50]], 6, '#e0202a'); }
    else if (open) disc(128, 204, 20, '#3a1418', 13);
    else if (shut) line([[104, 208], [116, 202], [128, 208], [140, 202], [152, 208]], 6, '#3a1418');
    else if (kind === 'nervous') line([[92, 214], [104, 206], [116, 214], [128, 206], [140, 214], [152, 206], [164, 214]], 7, '#3a1418');
    else if (kind === 'dazed') line([[98, 210], [112, 220], [128, 208], [144, 220], [158, 210]], 7, '#3a1418');
    else { g.strokeStyle = '#3a1418'; g.lineWidth = 7; g.beginPath(); g.arc(128, 190, 26, 0.5, PI - 0.5); g.stroke(); }
    const my = kind === 'scream' ? 160 : 170; // moustache
    g.fillStyle = '#9a9da6'; g.beginPath(); g.moveTo(128, my - 8); g.bezierCurveTo(96, my - 22, 66, my, 62, my + 18); g.bezierCurveTo(90, my + 20, 112, my + 12, 128, my + 4);
    g.bezierCurveTo(144, my + 12, 166, my + 20, 194, my + 18); g.bezierCurveTo(190, my, 160, my - 22, 128, my - 8); g.fill();
    if (scared || shut) { g.fillStyle = '#6cc3ff'; g.beginPath(); g.moveTo(222, 40); g.quadraticCurveTo(240, 76, 222, 80); g.quadraticCurveTo(204, 76, 222, 40); g.fill(); }
  });
}

// ---------- cars ----------
// One profiled tyre and stamped alloy face per wheel, including the tread shoulder and recessed rim.
const wheelProfile = [[0, -0.125], [0.17, -0.125], [0.214, -0.095], [0.245, -0.116], [0.292, -0.12], [0.328, -0.092], [0.34, -0.068],
  [0.34, 0.068], [0.328, 0.092], [0.292, 0.12], [0.245, 0.116], [0.214, 0.095], [0.17, 0.125], [0, 0.125]];
const wheelGeo = new THREE.LatheGeometry(wheelProfile.map(([r, h]) => new THREE.Vector2(r, h)), 24);
for (let i = 0; i < wheelGeo.attributes.uv.count; i++) {
  const p = wheelGeo.attributes.position;
  wheelGeo.attributes.uv.setXY(i, 0.5 + p.getX(i) / 0.69, 0.5 + p.getZ(i) / 0.69);
}
let wheelPaint;
function wheel(parent, x, z) {
  const steer = new THREE.Group(), spin = new THREE.Group(); steer.position.set(x, 0.34, z);
  if (!wheelPaint) {
    const map = tex(256, 256, (g) => {
      g.translate(128, 128);
      const circle = (r, c) => { g.fillStyle = c; g.beginPath(); g.arc(0, 0, r, 0, PI * 2); g.fill(); };
      circle(184, '#22262c'); circle(112, '#35383e'); circle(108, '#25282d');
      for (let i = 0; i < 40; i++) { g.rotate(PI / 20); g.fillStyle = '#414348'; g.fillRect(117, 0, 10, 2.8); }
      circle(83, '#cbd2d6'); circle(76, '#69757c'); circle(67, '#343f49');
      for (let i = 0; i < 5; i++) {
        g.rotate(2 * PI / 5); g.fillStyle = '#d9e0e4'; g.beginPath(); g.moveTo(-9, -18); g.lineTo(-14, -72); g.lineTo(6, -76); g.lineTo(13, -24); g.fill();
        g.fillStyle = '#94a1a8'; g.fillRect(4, -64, 4, 36);
      }
      circle(26, '#a4afb7'); circle(16, '#d7dfe1'); circle(10, '#6d7881');
      for (let i = 0; i < 5; i++) { g.rotate(2 * PI / 5); g.fillStyle = '#485159'; g.beginPath(); g.arc(0, -21, 3.5, 0, PI * 2); g.fill(); }
    });
    const finish = tex(128, 128, (g) => {
      g.fillStyle = '#00da00'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#0075a0'; g.beginPath(); g.arc(64, 64, 41, 0, PI * 2); g.fill();
    });
    finish.colorSpace = THREE.NoColorSpace;
    wheelPaint = mat('#ffffff', { map, roughness: 1, roughnessMap: finish, metalness: 1, metalnessMap: finish });
  }
  const w = new THREE.Mesh(wheelGeo, wheelPaint); w.rotation.x = PI / 2; w.castShadow = true;
  spin.add(w); steer.add(spin); parent.add(steer); return { steer, spin };
}
function extrude(draw, width, material) {
  const s = new THREE.Shape(); draw(s);
  const g = new THREE.ExtrudeGeometry(s, { depth: width - 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -(width - 0.1) / 2);
  const m = new THREE.Mesh(g, material); m.castShadow = m.receiveShadow = true; return m;
}
const arch = (s, x) => { s.lineTo(x - 0.42, 0.4); s.absarc(x, 0.4, 0.42, PI, 0, true); };
const glassMat = new THREE.MeshStandardMaterial({ color: '#cfeaff', transparent: true, opacity: 0.2, roughness: 0.1, depthWrite: false });
const pane = (w, h, d, x, y, z, rz = 0, m = glassMat) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); p.position.set(x, y, z); p.rotation.z = rz; return p; };

function plate() {
  return tex(256, 60, (g) => { g.fillStyle = '#f7c400'; g.fillRect(0, 0, 256, 60); g.fillStyle = '#1f4fb4'; g.fillRect(0, 0, 30, 60); g.fillStyle = '#fff'; g.font = `700 16px ${FONT}`; g.fillText('NL', 5, 50);
    g.fillStyle = '#111'; g.font = `400 40px ${FONT}`; g.textAlign = 'center'; g.fillText('JB-007-L', 143, 45); });
}

function lessonCar(world) {
  const b = world.box, bm = world.beam;
  const root = new THREE.Group(), pitch = new THREE.Group(), roll = new THREE.Group(), body = new THREE.Group(), shell = new THREE.Group();
  roll.position.y = 0.75; body.position.y = -0.75; root.add(pitch); pitch.add(roll); roll.add(body); body.add(shell);
  const white = mat('#fbfaf4', { roughness: 0.24, metalness: 0.23 }), dark = '#2b2e36', orange = '#ff6a13';
  shell.add(
    extrude((s) => { s.moveTo(0.72, 0.4); arch(s, 1.25); s.lineTo(1.9, 0.4); s.lineTo(1.9, 0.78); s.lineTo(1.76, 0.94); s.lineTo(0.72, 1.0); }, 1.72, white),
    extrude((s) => { s.moveTo(-1.9, 0.4); arch(s, -1.25); s.lineTo(-0.55, 0.4); s.lineTo(-0.55, 1.0); s.lineTo(-1.8, 1.0); s.lineTo(-1.9, 0.9); }, 1.72, white),
    b(1.3, 0.1, 1.66, dark, 0.085, 0.41, 0), b(0.7, 0.36, 1.3, '#1c1e23', 1.25, 0.58, 0), b(0.7, 0.36, 1.3, '#1c1e23', -1.25, 0.58, 0),
    b(1.0, 0.07, 1.735, orange, 1.24, 0.9, 0), b(1.3, 0.07, 1.735, orange, -1.22, 0.9, 0), // stripe
    b(0.1, 0.16, 1.56, dark, 1.93, 0.47, 0), b(0.1, 0.16, 1.56, dark, -1.93, 0.47, 0), // bumpers
    b(0.3, 0.22, 1.58, dark, 0.6, 0.92, 0), // dashboard
    b(1.36, 0.08, 1.52, white.color.getStyle(), -0.32, 1.8, 0), // roof
    b(0.12, 0.22, 0.46, '#1f5fd0', -0.3, 1.95, 0),
  );
  const L = tex(64, 64, (g) => { g.fillStyle = '#1f5fd0'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.font = `400 56px ${FONT}`; g.textAlign = 'center'; g.fillText('L', 32, 52); });
  for (const s of [1, -1]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ map: L })); l.position.set(-0.3 + s * 0.062, 1.95, 0); l.rotation.y = s * PI / 2; shell.add(l); }
  for (const z of [-1, 1]) {
    shell.add(bm([0.74, 1.0, z * 0.8], [0.3, 1.78, z * 0.72], 0.08, '#fbfaf4'), bm([-0.55, 1.0, z * 0.8], [-0.55, 1.78, z * 0.72], 0.08, '#fbfaf4'), bm([-1.1, 1.0, z * 0.8], [-0.95, 1.78, z * 0.72], 0.08, '#fbfaf4'));
    shell.add(pane(0.5, 0.7, 0.02, -0.8, 1.38, z * 0.76));
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 16), mat('#fff8d0', { emissive: '#fff2a8', emissiveIntensity: 0.9 })); lamp.rotation.z = PI / 2; lamp.position.set(1.95, 0.68, z * 0.58);
    shell.add(lamp, b(0.06, 0.12, 0.3, '#e0202a', -1.95, 0.84, z * 0.58, { emissive: '#ff2020', emissiveIntensity: 0.6 }));
    shell.add(b(0.5, 0.16, 0.5, '#3b3f4a', -0.24, 0.54, z * 0.4), b(0.1, 0.52, 0.46, '#3b3f4a', -0.5, 0.88, z * 0.4)); // seats
  }
  shell.add(pane(0.02, 0.88, 1.48, 0.52, 1.39, 0, 0.525), pane(0.02, 0.78, 1.48, -1.025, 1.39, 0, -0.195));
  // The original bumper is the extremity. The grille and pressed ribs sit on the nose within it.
  const faceTrim = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.245), mat('#ffffff', { map: tex(192, 64, (g) => {
    g.fillStyle = '#69747b'; g.fillRect(0, 0, 192, 64); g.fillStyle = '#29363e'; g.fillRect(4, 4, 184, 56);
    for (const y of [13, 27, 41, 52]) { g.fillStyle = '#849298'; g.fillRect(9, y, 174, 3); }
    g.fillStyle = '#dae5e7'; g.beginPath(); g.ellipse(96, 30, 13, 9, 0, 0, PI * 2); g.fill();
    g.fillStyle = '#496473'; g.fillRect(90, 28, 12, 4);
  }), roughness: 0.4, metalness: 0.18 }));
  faceTrim.rotation.y = PI / 2; faceTrim.position.set(1.975, 0.675, 0); shell.add(faceTrim);
  const pl = new THREE.MeshStandardMaterial({ map: plate() });
  for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.12), pl); p.position.set(s * 1.985, 0.47, 0); p.rotation.y = s * PI / 2; shell.add(p); }

  // doors, hinged at the front edge, with the driving school on them
  const decal = tex(512, 256, (g) => {
    g.fillStyle = '#fbfaf4'; g.fillRect(0, 0, 512, 256); g.fillStyle = orange; g.fillRect(0, 34, 512, 32);
    g.fillStyle = '#ffc17a'; g.fillRect(0, 32, 512, 4); g.fillStyle = '#c34d13'; g.fillRect(0, 66, 512, 5);
    g.strokeStyle = '#c7c7be'; g.lineWidth = 5; g.beginPath(); g.moveTo(10, 227); g.quadraticCurveTo(240, 243, 500, 219); g.stroke();
    g.fillStyle = '#14213d'; g.textAlign = 'center'; g.font = `400 88px ${FONT}`; g.fillText('RIJSCHOOL', 256, 186);
  });
  const door = (z) => {
    const h = new THREE.Group(); h.position.set(0.67, 0, z * 0.83);
    const panel = b(1.17, 0.6, 0.07, '#ffffff', -0.585, 0.72, 0, { map: decal, roughness: 0.25, metalness: 0.2 });
    const uv = panel.geometry.attributes.uv, outside = z > 0 ? 4 : 5;
    for (let i = 0; i < uv.count; i++) if (Math.floor(i / 4) !== outside) uv.setXY(i, 0.01, 0.96);
    h.add(panel, moulded(0.16, 0.04, 0.03, 0.009, mat(dark), -0.95, 0.86, z * 0.05),
      moulded(0.1, 0.12, 0.2, 0.025, white, -0.12, 1.08, z * 0.12));
    shell.add(h); return h;
  };
  const doorL = door(-1), doorR = door(1);
  const wheelRim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 8, 20), mat(dark)); wheelRim.position.set(0.34, 1.0, -0.4); wheelRim.rotation.y = PI / 2; wheelRim.add(b(0.03, 0.3, 0.03, dark));
  shell.add(wheelRim);
  const wheels = [wheel(body, 1.25, -0.76), wheel(body, 1.25, 0.76), wheel(body, -1.25, -0.76), wheel(body, -1.25, 0.76)];
  return { root, pitch, roll, body, shell, doorL, doorR, wheels, wheelRim };
}

function toyCar(world, color) {
  const b = world.box, g = new THREE.Group();
  const body = extrude((s) => { s.moveTo(-1.8, 0.4); arch(s, -1.2); arch(s, 1.2); s.lineTo(1.8, 0.4); s.lineTo(1.8, 0.8); s.lineTo(1.66, 0.95); s.lineTo(0.75, 1.0); s.lineTo(0.3, 1.5); s.lineTo(-1.0, 1.5); s.lineTo(-1.25, 1.0); s.lineTo(-1.75, 1.0); s.lineTo(-1.8, 0.9); }, 1.6, mat('#ffffff', { roughness: 0.26, metalness: 0.25 }));
  // Front and rear lamp clusters printed on the original end faces keep every parked footprint exact.
  body.material.map = tex(256, 128, (g) => {
    g.fillStyle = color; g.fillRect(0, 0, 256, 128);
    for (const dx of [0, 128]) {
      for (const u of [12, 92]) {
        g.fillStyle = dx ? '#742830' : '#4c5662'; g.fillRect(dx + u, 35, 24, 19);
        g.fillStyle = dx ? '#ff5253' : '#fff1ba'; g.fillRect(dx + u + 2, 37, 20, 11);
        g.fillStyle = '#ef9a3c'; g.fillRect(dx + u + 2, 49, 20, 3);
      }
      g.fillStyle = '#39434d'; g.fillRect(dx + 37, 41, 54, 19);
      g.fillStyle = dx ? '#edba36' : '#929fa3'; g.fillRect(dx + 41, 45, 46, dx ? 11 : 3);
    }
  });
  const { position, normal, uv } = body.geometry.attributes;
  for (let i = 0; i < uv.count; i++) {
    const x = position.getX(i), end = Math.abs(x) > 1.71 && Math.abs(normal.getX(i)) > 0.7;
    if (end) uv.setXY(i, (x < 0 ? 0.5 : 0) + (position.getZ(i) / 1.65 + 0.5) * 0.5, clamp((position.getY(i) - 0.33) / 0.68, 0, 1));
    else uv.setXY(i, 0.015, 0.98);
  }
  g.add(body);
  const win = mat('#22344a', { roughness: 0.2 });
  g.add(pane(1.1, 0.34, 1.62, -0.33, 1.25, 0, 0, win), pane(0.04, 0.5, 1.3, 0.566, 1.287, 0, 0.73, win), pane(0.04, 0.42, 1.3, -1.174, 1.275, 0, -0.464, win));
  g.add(b(0.7, 0.36, 1.2, '#1c1e23', 1.2, 0.58, 0), b(0.7, 0.36, 1.2, '#1c1e23', -1.2, 0.58, 0));
  for (const x of [-1.2, 1.2]) for (const z of [-0.7, 0.7]) wheel(g, x, z);
  return g;
}

// ---------- particles ----------
export function puffs(scene, n, color = '#f6f6f2') {
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), mat(color, { flatShading: true, roughness: 1 }), n);
  const P = Array.from({ length: n }, () => ({ life: 0 })), M = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0); let next = 0;
  for (let i = 0; i < n; i++) mesh.setMatrixAt(i, ZERO);
  mesh.frustumCulled = false; scene.add(mesh);
  return {
    emit(x, y, z, size = 1, vx = 0, vz = 0) { Object.assign(P[next], { x, y, z, vx: vx + (random() - 0.5) * 1.6, vy: 0.7 + random(), vz: vz + (random() - 0.5) * 1.6, age: 0, life: 0.9 + random() * 0.8, size: size * (0.6 + random() * 0.7) }); next = (next + 1) % n; },
    update(dt) {
      P.forEach((p, i) => {
        if (p.life <= 0) return;
        p.age += dt; if (p.age >= p.life) { p.life = 0; mesh.setMatrixAt(i, ZERO); return; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 1 - 1.5 * dt; p.vz *= 1 - 1.5 * dt;
        const k = p.age / p.life, s = p.size * Math.min(1, 0.3 + k * 2.4) * (1 - ramp(k, 0.5, 1));
        mesh.setMatrixAt(i, M.makeScale(s, s, s).setPosition(p.x, p.y, p.z));
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    clear() { P.forEach((p, i) => { p.life = 0; mesh.setMatrixAt(i, ZERO); }); },
  };
}
function skids(scene, n) {
  const geo = new THREE.PlaneGeometry(0.7, 0.24); geo.rotateX(-PI / 2);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#15161a', transparent: true, opacity: 0.5, depthWrite: false }), n);
  const M = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0); let next = 0;
  const clear = () => { for (let i = 0; i < n; i++) mesh.setMatrixAt(i, ZERO); mesh.instanceMatrix.needsUpdate = true; };
  clear(); mesh.frustumCulled = false; scene.add(mesh);
  return { clear, drop(x, y, z, h) { mesh.setMatrixAt(next, M.makeRotationY(-h).setPosition(x, GROUND + y + 0.04, z)); next = (next + 1) % n; mesh.instanceMatrix.needsUpdate = true; } };
}
function confetti(scene, n) {
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.13, 0.2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n);
  const P = Array.from({ length: n }, () => ({ on: false })), D = new THREE.Object3D(), COL = ['#ff6a13', '#ffffff', '#1f5fd0', '#e0202a', '#f7c400', '#3fbf6a', '#ff5fa8'];
  D.scale.setScalar(0); D.updateMatrix(); for (let i = 0; i < n; i++) { mesh.setMatrixAt(i, D.matrix); mesh.setColorAt(i, new THREE.Color(pick(COL, i))); }
  mesh.frustumCulled = false; scene.add(mesh);
  return {
    burst(x, y, z, spread = 5) { P.forEach((p) => Object.assign(p, { on: true, x: x + (random() - 0.5) * 2, y: y + random(), z: z + (random() - 0.5) * 2, vx: (random() - 0.5) * spread, vy: 4 + random() * 6, vz: (random() - 0.5) * spread, a: random() * 6, b: random() * 6, w: 3 + random() * 8 })); },
    update(dt, t) {
      P.forEach((p, i) => {
        if (!p.on) return;
        if (p.y > GROUND + 0.03) { p.vy = Math.max(-1.6, p.vy - 9 * dt); p.x += (p.vx + sin(t * 2 + p.a) * 0.8) * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 1 - dt; p.vz *= 1 - dt; p.a += p.w * dt; p.b += p.w * 0.7 * dt; }
        else { p.y = GROUND + 0.03; p.a = PI / 2; p.b = 0; } // lies flat where it lands
        D.position.set(p.x, p.y, p.z); D.rotation.set(p.a, p.b, 0); D.scale.setScalar(1); D.updateMatrix(); mesh.setMatrixAt(i, D.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    clear() { D.scale.setScalar(0); D.updateMatrix(); P.forEach((p, i) => { p.on = false; mesh.setMatrixAt(i, D.matrix); }); mesh.instanceMatrix.needsUpdate = true; },
  };
}

// ---------- everything together ----------
export function buildCast(scene, world, drive) {
  const { layout, L } = drive, b = world.box, bm = world.beam, H = layout.hop, RV = layout.rev, BS = layout.boom.s;
  const zone = (s, a, z, e = 3) => ramp(s, a, a + e) * (1 - ramp(s, z - e, z)); // 1 between two distances, eased in and out
  const car = lessonCar(world); scene.add(car.root);
  const smoke = puffs(scene, 220), marks = skids(scene, 3000), party = confetti(scene, 340);

  // Nikki: helmet on until the very end
  const nikki = person(b, { skin: '#c99c7c', shirt: '#ffffff', sleeve: '#c99c7c', pants: '#6f8fc0', face: nikkiFace(), hair: null, shoes: '#ffffff' });
  const blonde = mat('#e6cf9c', { roughness: 0.7, side: THREE.DoubleSide });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.222, 18, 8, 0, PI * 2, 0, PI / 2), blonde); cap.scale.y = 0.5; cap.position.y = 0.12;
  const curtain = new THREE.Mesh(new THREE.CylinderGeometry(0.222, 0.235, 0.36, 18, 1, true, 1.5 * PI - 2.2, 4.4), blonde); curtain.position.y = -0.05;
  const backHair = b(0.07, 0.5, 0.44, '#e6cf9c', -0.185, 0.4, 0, { roughness: 0.7 }); // long hair down her back
  nikki.head.add(cap, curtain); nikki.g.add(backHair);
  const showHair = (on) => { curtain.visible = backHair.visible = on; }; // tucked into the helmet until the reveal: nobody may guess who is driving
  nikki.g.add(b(0.268, 0.03, 0.2, '#f2c230', 0, 0.5, 0, { metalness: 0.5, roughness: 0.3 })); // necklace
  const helmet = new THREE.Group();
  const enamel = tex(512, 256, (g) => {
    g.fillStyle = '#ff6a13'; g.fillRect(0, 0, 512, 256);
    for (const u of [0, 256, 512]) {
      g.fillStyle = '#bf481c'; g.fillRect(u - 10, 0, 20, 256);
      g.fillStyle = '#fff1c9'; g.fillRect(u - 5, 0, 10, 256);
    }
    for (const u of [165, 347]) {
      g.fillStyle = '#6b392a'; g.beginPath(); g.ellipse(u, 115, 11, 15, 0, 0, PI * 2); g.fill();
      g.fillStyle = '#c8c9bf'; g.beginPath(); g.ellipse(u, 115, 6, 9, 0, 0, PI * 2); g.fill();
    }
    g.fillStyle = '#7b3a23'; g.fillRect(0, 210, 512, 6);
  });
  const shellM = new THREE.Mesh(new THREE.SphereGeometry(0.285, 24, 16), mat('#ffffff', { map: enamel, roughness: 0.24, metalness: 0.17 })); shellM.castShadow = true;
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.292, 20, 10, PI - 0.95, 1.9, 1.08, 0.72), mat('#ffffff', { map: tex(256, 96, (g) => {
    const tint = g.createLinearGradient(0, 0, 0, 96);
    for (const [y, c] of [[0, '#121820'], [0.16, '#455364'], [0.36, '#2d3847'], [0.72, '#141922'], [1, '#252932']]) tint.addColorStop(y, c);
    g.fillStyle = tint; g.fillRect(0, 0, 256, 96);
    g.strokeStyle = '#667380'; g.lineWidth = 2; g.beginPath(); g.moveTo(12, 16); g.quadraticCurveTo(117, 6, 244, 16); g.stroke();
  }), roughness: 0.18, metalness: 0.36 }));
  helmet.add(shellM, visor); nikki.head.add(helmet);
  nikki.g.position.set(-0.2, 0.62, -0.4); car.shell.add(nikki.g);

  // the examiner, with a clipboard and a little pen
  const moods = Object.fromEntries(['calm', 'nervous', 'scream', 'dazed', 'angry', 'pray'].map((k) => [k, examinerFace(k)]));
  for (const k of ['calm', 'nervous', 'angry']) moods[k + '!'] = examinerFace(k, true);
  const ex = person(b, { skin: '#f1c9a5', shirt: '#dfe9f5', pants: '#3a3f4f', face: moods.calm, hair: null, shoes: '#5a3b26' });
  const fringe = new THREE.Mesh(new THREE.CylinderGeometry(0.212, 0.212, 0.15, 18, 1, true, 1.5 * PI - 1.9, 3.8), mat('#9a9da6', { side: THREE.DoubleSide })); fringe.position.y = 0.04;
  ex.head.add(fringe); ex.g.add(b(0.02, 0.3, 0.08, '#d7263d', 0.135, 0.34, 0));
  const paper = (stamped) => tex(256, 340, (g) => {
    g.fillStyle = '#fffdf4'; g.fillRect(0, 0, 256, 340); g.fillStyle = '#14213d'; g.font = `400 26px ${FONT}`; g.fillText('RIJEXAMEN', 20, 44);
    g.strokeStyle = '#9aa3b5'; g.lineWidth = 4; for (let i = 0; i < 8; i++) { g.strokeRect(20, 64 + i * 32, 20, 20); g.beginPath(); g.moveTo(54, 76 + i * 32); g.lineTo(150 + ((i * 37) % 70), 76 + i * 32); g.stroke(); }
    if (stamped) { g.translate(128, 190); g.rotate(-0.3); g.strokeStyle = g.fillStyle = '#e0202a'; g.lineWidth = 8; g.strokeRect(-116, -40, 232, 80); g.font = `400 44px ${FONT}`; g.textAlign = 'center'; g.fillText('GESLAAGD', 0, 16); }
  });
  const papers = { blank: paper(false), stamped: paper(true) };
  const clip = new THREE.Group();
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), new THREE.MeshStandardMaterial({ map: papers.blank })); sheet.rotation.y = PI / 2; sheet.position.set(0.016, 0, 0);
  clip.add(b(0.02, 0.32, 0.24, '#8a5a3a'), sheet, b(0.03, 0.04, 0.1, '#b9bec9', 0.01, 0.15, 0)); ex.g.add(clip);
  ex.armR.add(b(0.025, 0.16, 0.025, '#1f5fd0', 0.06, -0.48, 0));
  // The clipboard rides on his lap while he sits, propped on his shoes so he can read it: nothing in the cabin reaches it there. Carried, it lies flat
  // along his forearm with the top of the page at his hand, so it can never cut into the arm. grab blends lap to arm; turn swings it round the arm
  // (0 = on top, 1 = on the front of a raised arm, the paper at the camera); side 1 = towards his chest (in his seat), 0 = outboard (clear of his head and leg).
  const lapP = new THREE.Vector3(0.335, 0.168, 0), lapQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(PI, 0, 0.35 + PI / 2, 'ZYX')), armM = new THREE.Matrix4(), armE = new THREE.Euler(PI, 0, 0, 'YXZ'), armP = new THREE.Vector3(), armQ = new THREE.Quaternion(), armS = new THREE.Vector3();
  const hold = (grab = 0, turn = 0, side = 0) => { // call after scaling it
    if (!grab) { clip.position.copy(lapP); clip.quaternion.copy(lapQ); return; }
    const k = clip.scale.x, q = armE.y = turn * PI, r = 0.075 * (Math.abs(cos(q)) + Math.abs(sin(q))) + 0.002 + 0.01 * k; ex.armL.updateMatrix();
    armM.makeRotationFromEuler(armE).setPosition(r * cos(q), -0.34 - 0.16 * (k - 1), -r * sin(q) + lerp(-0.045, 0.075, side) - 0.12 * (k - 1)).premultiply(ex.armL.matrix).decompose(armP, armQ, armS); // blown up to show the stamp, it grows up and outwards
    clip.position.set(lerp(lapP.x, armP.x, grab), lerp(lapP.y, armP.y, ramp(grab, 0, 0.6)) + 0.08 * sin(PI * grab), lerp(lapP.z, armP.z, ramp(grab, 0.4, 1))); clip.quaternion.slerpQuaternions(lapQ, armQ, grab); // picked up: lifted over his arm first, then across onto it
  };
  hold();
  // for exam.audit(): the solid things in and around the car that the clipboard is poking into right now (points all over the board against each one's box)
  const pokeM = new THREE.Matrix4(), pokeV = new THREE.Vector3();
  const poke = () => {
    const hits = []; car.root.updateMatrixWorld(true);
    car.shell.traverse((m) => {
      if (!m.isMesh || m.parent === clip) return;
      const bb = m.geometry.boundingBox || (m.geometry.computeBoundingBox(), m.geometry.boundingBox); pokeM.copy(m.matrixWorld).invert().multiply(clip.matrixWorld);
      for (let i = 0; i < 126; i++) if (bb.containsPoint(pokeV.set(i % 2 ? 0.01 : -0.01, -0.16 + ((i >> 1) % 9) * 0.04, -0.12 + Math.floor(i / 18) * 0.04).applyMatrix4(pokeM))) { hits.push(m.name || [...car.shell.worldToLocal(m.getWorldPosition(pokeV))].map((v) => v.toFixed(1)).join(',')); break; }
    });
    return hits;
  };
  ex.g.position.set(-0.2, 0.62, 0.4); car.shell.add(ex.g);

  // cyclists on Dutch bikes
  const bikeF = bikeGeo.frame(), bikeW = bikeGeo.wheel();
  const cyclists = layout.cyclists.map((c, i) => {
    const g = new THREE.Group(), lean = new THREE.Group(), paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, color: pick(['#2a2e38', '#2f6fc9', '#e9503a', '#f4f1e6', '#3aa66a'], i) }); g.add(lean);
    const wheels = [-1, 1].map((k) => { const w = new THREE.Mesh(bikeW, paint); w.position.set(k * bikeGeo.HUB, bikeGeo.WR, 0); w.castShadow = true; lean.add(w); return w; });
    const fr = new THREE.Mesh(bikeF, paint); fr.castShadow = true; lean.add(fr, b(0.34, 0.22, 0.4, '#b98a52', 0.7, 0.92, 0));
    for (const z of [-0.09, 0.09]) lean.add(bm([0.7, 0.81, z], [bikeGeo.HUB, bikeGeo.WR, z], 0.02, '#1c1c1c')); // the crate stands on struts from the front axle
    const tulips = pick(['#e0202a', '#f7c400', '#ff5fa8', '#ffffff'], i); for (const z of [-0.1, 0.1]) lean.add(b(0.1, 0.16, 0.1, tulips, 0.7, 1.1, z));
    const p = person(b, { shirt: pick(['#e0202a', '#1f5fd0', '#f7c400', '#3fbf6a', '#ff5fa8', '#7a4fd0', '#ff6a13'], i), pants: pick(['#2d3142', '#6f8fc0', '#4a3f3a'], i), skin: pick(['#f1c9a5', '#c99c7c', '#8d5a3c'], i), hair: pick(['#4a3526', '#e6cf9c', '#1d1f24', '#b5532a'], i), face: pick(['smile', 'o', 'grin'], i) });
    p.g.position.set(-0.2, 0.98, 0); p.armL.rotation.z = p.armR.rotation.z = 0.95; lean.add(p.g); scene.add(g); // hands on the grips
    return { c, g, lean, p, wheels, rung: false };
  });

  // parked cars and the crowd by the Accijnstoren
  layout.parked.forEach((pc, i) => { const g = toyCar(world, pick(['#e0202a', '#1f5fd0', '#f7c400', '#3fbf6a', '#7a4fd0'], i)); g.position.set(pc.x, GROUND, pc.z); g.rotation.y = -pc.h + (i % 2 ? PI : 0); scene.add(g); });
  const signTex = (word) => tex(256, 128, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#ff6a13'; g.font = `400 60px ${FONT}`; g.textAlign = 'center'; g.fillText('HUP', 128, 58); g.fillStyle = '#14213d'; g.fillText(word, 128, 116); });
  const signs = { before: signTex('KANJER!'), after: signTex('NIKKI!') }, signMat = new THREE.MeshStandardMaterial({ map: signs.before, side: THREE.DoubleSide }); // her name only goes up at the reveal
  const crowd = layout.crowd.map((c, i) => {
    const p = person(b, { shirt: pick(['#ff6a13', '#1f5fd0', '#e0202a', '#3fbf6a', '#f7c400', '#ff5fa8', '#7a4fd0'], i * 3), pants: pick(['#2d3142', '#6f8fc0', '#4a3f3a'], i), skin: pick(['#f1c9a5', '#8d5a3c', '#c99c7c'], i), hair: pick(['#e6cf9c', '#4a3526', '#b5532a', '#1d1f24', '#9a9da6'], i), face: pick(['grin', 'smile', 'o'], i) });
    p.g.position.set(c.x, GROUND + 0.55, c.z); p.g.rotation.y = -(c.h - PI / 2); scene.add(p.g);
    if ([1, 3, 4, 6].includes(i)) { const s = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), signMat); s.rotation.y = PI / 2; s.position.set(0.125, 1.6, 0); p.sign = true; p.g.add(s, b(0.04, 1.05, 0.04, '#8a5a3a', 0.1, 1.325, -0.33), b(0.04, 1.05, 0.04, '#8a5a3a', 0.1, 1.325, 0.33)); } // a banner on two poles, one in each raised fist
    return p;
  });

  // People along the whole route who stop to watch: a hundred-odd of them in six draw calls. Each is a shirt, a skin part, a hair-and-trousers part
  // (one tint: brown hair, brown trousers), a drawn face and two bare arms that swing at the shoulder. They turn to follow the car, and cheer, flinch, wave or point.
  const WHITE = '#ffffff', tintMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const watchers = world.people.map((o, i) => { const k = Math.imul(i + 3, 2654435761) >>> 8, sc = k % 9 === 4 ? 0.68 : 0.92 + (k % 5) * 0.035; return { x: o.x, z: o.z, k, sc, phi0: atan2(-o.side * cos(o.a), o.side * sin(o.a)) }; }); // phi0: facing the street
  const crowdOf = (geo, material, n = watchers.length) => { const m = new THREE.InstancedMesh(geo, material, n); m.castShadow = true; m.frustumCulled = false; scene.add(m); return m; };
  const wShirt = crowdOf(fuse([box(0.26, 0.52, 0.5), WHITE, 0, 0.26, 0], [box(0.17, 0.15, 0.17), WHITE, 0, 0.46, 0.33], [box(0.17, 0.15, 0.17), WHITE, 0, 0.46, -0.33]), tintMat());
  const wSkin = crowdOf(fuse([HEAD.clone(), WHITE, 0, 0.73, 0], [box(0.05, 0.09, 0.03), WHITE, 0, 0.73, 0.205], [box(0.05, 0.09, 0.03), WHITE, 0, 0.73, -0.205], [box(0.2, 0.05, 0.34), WHITE, 0, 0.535, 0]), tintMat());
  const wHair = crowdOf(fuse([HAIR.clone().scale(1, 0.55, 1), WHITE, 0, 0.85, 0], [box(0.06, 0.2, 0.36), WHITE, -0.19, 0.79, 0], ...[0.13, -0.13].flatMap((z) => [[box(0.2, 0.55, 0.22), '#c4c4c4', 0, -0.275, z], [box(0.28, 0.1, 0.25), '#2a2a2a', 0.04, -0.51, z]])), tintMat());
  const wArm = crowdOf(fuse([box(0.15, 0.5, 0.15), WHITE, 0, -0.2, 0]), tintMat(), watchers.length * 2);
  const wFace = ['smile', 'o', 'grin'].map((kind) => crowdOf(new THREE.CylinderGeometry(0.203, 0.203, 0.32, 16, 1, true, PI / 2 - 0.8, 1.6).translate(0, 0.73, 0), new THREE.MeshStandardMaterial({ map: plainFace(kind), alphaTest: 0.45, roughness: 0.6 })));
  wFace.forEach((m) => { m.castShadow = false; });
  { const c = new THREE.Color(), SHIRTS = ['#e0202a', '#1f5fd0', '#f7c400', '#3fbf6a', '#ff5fa8', '#7a4fd0', '#ff6a13', '#f4f1e6', '#22b5c4'], SKINS = ['#f1c9a5', '#c99c7c', '#8d5a3c', '#f6d7b8'], HAIRS = ['#4a3526', '#e6cf9c', '#2a2c33', '#b5532a', '#9a9da6', '#6b4a2f'];
    watchers.forEach((w, i) => { wShirt.setColorAt(i, c.set(pick(SHIRTS, w.k))); wSkin.setColorAt(i, c.set(pick(SKINS, w.k >> 3))); wArm.setColorAt(2 * i, c); wArm.setColorAt(2 * i + 1, c); wHair.setColorAt(i, c.set(pick(HAIRS, w.k >> 5))); }); }
  const wD = new THREE.Object3D(), wM = new THREE.Matrix4(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0), turn = (a) => a - 2 * PI * Math.round(a / (2 * PI));
  const watch = (st, now) => {
    const eye = world.eye, fast = ramp(abs(st.v), 1, 6);
    watchers.forEach((w, i) => {
      const dx = st.x - w.x, dz = st.z - w.z, d = hypot(dx, dz), near = (1 - ramp(d, 9, 30)) * fast, ph = now * (8 + (w.k % 3)) + w.k, idle = 0.05 * sin(now * 1.3 + w.k);
      let hop = 0, lean = 0, aL = idle, aR = -idle;
      if (w.k % 4 === 0) { hop = abs(sin(ph)) * 0.2 * near; aL = aR = near * (2.8 + 0.3 * sin(ph * 2)); } // jumping for joy
      else if (w.k % 4 === 1) { lean = 0.2 * near; aL = aR = near * 2.3; } // hands up, leaning away
      else if (w.k % 4 === 2) aR = near * (2.85 + 0.4 * sin(ph)); // waving
      else { aL = near * 1.5; aR = near * (0.5 + 0.2 * sin(ph)); } // pointing it out
      wD.position.set(w.x, GROUND + 0.56 * w.sc + hop, w.z); wD.rotation.set(0, -(w.phi0 + turn(atan2(dz, dx) - w.phi0) * (1 - ramp(d, 30, 60))), lean);
      wD.scale.setScalar(eye && hypot(eye.x - w.x, eye.z - w.z) < 1.6 ? 0 : w.sc); wD.updateMatrix(); // nobody is ever half inside the camera
      wShirt.setMatrixAt(i, wD.matrix); wSkin.setMatrixAt(i, wD.matrix); wHair.setMatrixAt(i, wD.matrix); wFace.forEach((m, j) => m.setMatrixAt(i, j === (near > 0.3 ? 1 + (w.k % 2) : 0) ? wD.matrix : ZERO)); // a smile, until the car comes
      [aL, aR].forEach((a, j) => wArm.setMatrixAt(2 * i + j, wM.makeRotationZ(a).setPosition(0, 0.47, j ? 0.33 : -0.33).premultiply(wD.matrix)));
    });
    for (const m of [wShirt, wSkin, wHair, wArm, ...wFace]) m.instanceMatrix.needsUpdate = true;
  };

  // Two cheese carriers in the middle of the Waagplein with a berrie of Gouda between them. They stand frozen; only their heads follow the car.
  const carriers = new THREE.Group(); carriers.position.set(layout.donut.x, GROUND, layout.donut.z); carriers.rotation.y = Math.PI / 2; // side on to the camera that stands west of them (main.js)
  const VEEM = '#e0202a', tinted = (geo, color = '#ffffff') => { const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, color, roughness: 0.55 })); m.castShadow = true; return m; };
  carriers.add(tinted(berrieGeo('tint'), VEEM), tinted(berrieGeo('rest')));
  { const fy = (x) => 0.54 + 0.3 * (x / 0.85) ** 2, R = 0.17, geo = cheeseWheelGeo().scale(R / 0.36, 1.18, R / 0.36); // fy: the curve of the berrie's floor (landmarks.js). Each wheel lies across it like a chord, so none sinks in
    for (const c of [-0.575, -0.2, 0.2, 0.575, 0]) { const ch = tinted(geo); if (c) { ch.position.set(c, (fy(c - R) + fy(c + R)) / 2 + 0.025, 0); ch.rotation.z = atan2(fy(c + R) - fy(c - R), 2 * R); } else ch.position.y = 0.73; carriers.add(ch); } } // the fifth rides on the middle two
  const kaas = [-1.52, 1.52].map((x) => { // at arm's length from the handles: the rear man reaches forward, the front man behind him
    const p = person(b, { shirt: '#ffffff', pants: '#ffffff', hair: null, face: 'o', shoes: '#ffffff' }); p.g.position.set(x, 0.55, 0); p.armL.rotation.z = p.armR.rotation.z = x < 0 ? 1.228 : -1.228;
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16), mat('#f3e2a8')), top = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.2, 0.12, 16), mat('#f3e2a8')), band = new THREE.Mesh(new THREE.CylinderGeometry(0.203, 0.21, 0.05, 16), mat(VEEM));
    hat.position.y = 0.2; top.position.y = 0.285; band.position.y = 0.25; p.head.add(hat, top, band); carriers.add(p.g); return p;
  });
  scene.add(carriers);

  // The duck family of the emergency stop: a mother and five ducklings. drive.js says where each one is at any moment.
  const tour = rondvaartboot(); tour.traverse((o) => { o.castShadow = true; }); scene.add(tour); // the canal tour boat the drawbridge stands open for
  const DK = layout.ducks, BILL = '#f08a1c', sph = (r) => new THREE.SphereGeometry(r, 10, 8);
  const ducklingGeo = fuse([sph(0.09).scale(1.25, 0.85, 0.95), '#f7d84a', 0, 0.065, 0], [sph(0.065), '#fbe37a', 0.1, 0.165, 0], [new THREE.ConeGeometry(0.024, 0.07, 6).rotateZ(-PI / 2), BILL, 0.185, 0.155, 0], [sph(0.013), '#1b1b1b', 0.14, 0.185, 0.045], [sph(0.013), '#1b1b1b', 0.14, 0.185, -0.045]);
  const ducks = Array.from({ length: DK.n }, (_, i) => {
    const g = new THREE.Group(), leg = i ? 0.05 : 0.1, body = tinted(i ? ducklingGeo : duckGeo().scale(1.5, 1.5, 1.5)), w = i ? 0.035 : 0.06;
    const feet = tinted(fuse(...[w, -w].flatMap((z) => [[box(0.02, leg, 0.02), BILL, 0, leg / 2, z], [box(w * 1.3, 0.016, w * 0.9), BILL, w * 0.5, 0.008, z]])));
    g.add(body, feet); scene.add(g); return { g, body, feet, leg, wet: false, h: 0 };
  });

  const V = new THREE.Vector3(); let mood = 'calm', fear = 0, dist = 0, spun = 0, steer = 0, lastDrop = 0, headPhase = 0, talking = false, lurch = 0;
  const setMood = (k, now = 0) => { mood = k; const t = (talking && sin(now * 34) > 0 && moods[k + '!']) || moods[k]; if (ex.faceMat.map !== t) ex.faceMat.map = t; }; // his mouth moves while he talks

  function reset() {
    smoke.clear(); marks.clear(); party.clear(); fear = 0; lurch = 0; dist = 0; spun = 0; lastDrop = 0; headPhase = 0; talking = false; setMood('calm'); showHair(false); signMat.map = signs.before; car.shell.rotation.z = 0;
    sheet.material.map = papers.blank; nikki.head.add(helmet); helmet.position.set(0, 0, 0); helmet.rotation.set(0, 0, 0); helmet.scale.setScalar(1);
    for (const p of [nikki, ex]) { p.g.rotation.set(0, 0, 0); p.head.rotation.set(0, 0, 0); sit(p); for (const a of [p.armL, p.armR]) a.rotation.set(0, 0, 0); }
    nikki.g.position.set(-0.2, 0.62, -0.4); ex.g.position.set(-0.2, 0.62, 0.4); car.doorL.rotation.y = car.doorR.rotation.y = 0; clip.scale.setScalar(1); hold();
    cyclists.forEach((c) => { c.rung = false; });
  }

  // one frame of the car and everyone reacting to it. st = drive state, t = drive time, now = wall clock
  function frame(st, t, dt, now, events) {
    watch(st, now);
    const { root, pitch, roll, shell, wheels } = car;
    root.position.set(st.x, st.y + GROUND, st.z); root.rotation.y = -st.yaw; pitch.rotation.z = st.pitch; roll.rotation.x = st.roll - st.lean;
    const acc = (drive.speed(st.s + 1) - drive.speed(st.s - 1)) * st.v / 2;
    shell.position.y = -st.squash; shell.rotation.z = clamp(acc * 0.004, -0.05, 0.05) + (st.air ? 0 : sin(now * 31) * 0.003 * st.v / 10);
    dist += st.v * dt; spun += st.v * dt * (st.rev > 0.5 ? -1 : 1);
    steer = lerp(steer, clamp(Math.atan(2.5 * st.k) * 1.4 - st.beta * 0.9, -0.6, 0.6), Math.min(1, dt * 10));
    wheels.forEach((w, i) => { w.spin.rotation.z = -(spun / 0.34) * (i > 1 && st.slide > 0.3 ? 1.8 : 1); if (i < 2) w.steer.rotation.y = -steer; });
    car.wheelRim.rotation.x = steer * 2.2;

    // tyre smoke and rubber from the rear wheels
    if (!st.air && st.slide > 0.22) {
      const c = cos(st.yaw), s = sin(st.yaw);
      for (const z of [-0.76, 0.76]) {
        const x = st.x - c * 1.25 - s * z, zz = st.z - s * 1.25 + c * z;
        if (random() < st.slide * dt * 55) smoke.emit(x, GROUND + st.y + 0.25, zz, 0.5 + st.slide * 0.45, -cos(st.travel) * 2, -sin(st.travel) * 2);
        if (dist - lastDrop > 0.45) marks.drop(x, st.y, zz, st.travel); // st.y: rubber stays on the bridge deck, not under it
      }
      if (dist - lastDrop > 0.45) lastDrop = dist;
    }
    smoke.update(dt);

    // fear rises with speed, sideways angle and altitude
    const target = clamp((st.v - 12) / 16 + Math.abs(st.beta) * 1.6 + (st.air ? 1 : 0) + (st.slide > 0.7 ? 0.5 : 0), 0, 1);
    fear = lerp(fear, target, Math.min(1, dt * (target > fear ? 5 : 1.2)));
    // what the examiner is busy with on this stretch: telling the driver off, watching where they have been, pretending nothing happened, praying
    const s = st.s, scold = Math.min(1, zone(s, H.land + 3, H.land + 44) + zone(s, drive.m.schapen - 30, drive.m.schapen + 4) + zone(s, RV.a1 + 24, RV.b1 + 34));
    const back = zone(s, RV.a0 + 8, RV.a1 + 23, 4), // he checks the road behind, then gives up and shouts at the driver instead
       stiff = zone(s, BS + 3, BS + 48, 2), pray = zone(s, L - 66, L - 35, 4), hug = Math.max(stiff, pray);
    setMood(st.air ? 'scream' : pray > 0.5 ? 'pray' : scold > 0.5 ? 'angry' : stiff > 0.5 ? 'nervous' : fear > 0.62 ? 'scream' : fear > 0.25 ? 'nervous' : 'calm', now);
    const shake = sin(now * 38) * Math.max(fear * (1 - scold), stiff), up = ramp(fear, 0.5, 0.8) * (1 - scold) * (1 - hug); // both arms in the air when it gets too much
    ex.armL.rotation.set(0, -0.5 * hug, lerp(lerp(1.2, 2.75, up), 1.45, hug) + shake * 0.12); // arms crossed over the clipboard
    ex.armR.rotation.set(0, lerp(0.5 * hug, 1.05, scold), lerp(lerp(lerp(1.1 + sin(now * 14) * 0.05 * (1 - fear), 2.9, up), 1.45, hug), 1.45 + sin(now * 11) * 0.13, scold) - shake * 0.12); // scolding: the pen jabs at the driver
    headPhase += dt * (2 + fear * 9); // a running phase: changing the speed of a shake must never make the head jump
    const glance = ramp(sin(now * 1.4), 0.5, 0.9), wobble = sin(headPhase) * 0.35 * ramp(fear, 0.2, 0.5) * (1 - ramp(fear, 0.6, 0.8));
    ex.head.rotation.z = lerp(-0.15, 0.3, fear) * (1 - hug) + shake * 0.03 + pray * 0.3;
    ex.head.rotation.y = lerp(lerp(wobble * (1 - hug), 1.0 + sin(now * 11) * 0.06, scold), lerp(-2.2, 0.9, glance), back); // over his shoulder at the road behind, then at the driver, then back
    lurch = lerp(lurch, clamp(acc * 0.02, -0.4, 0.1), Math.min(1, dt * 9)); // thrown at the windscreen when she brakes
    ex.g.rotation.set(clamp(-st.lean * 1.6 - st.beta * 0.25, -0.22, 0.22), 0.45 * back * (1 - glance), -fear * 0.12 + lurch);
    // Nikki: relaxed, steering, one arm out of the window during the doughnut
    const wave = ramp(st.s, drive.m.donut + 4, drive.m.donut + 14) * (1 - ramp(st.s, drive.m.schapen - 40, drive.m.schapen - 28));
    const look = st.rev * (1 - ramp(s, L - 9, L - 2)); // reversing: head round, one arm over the back of the other seat, as taught
    nikki.armR.rotation.set(0, -1.25 * look, lerp(1.45 + steer * 0.5, 1.5, look)); nikki.armL.rotation.z = lerp(1.45 - steer * 0.5, 0.2, wave); nikki.armL.rotation.x = wave * (1.5 + sin(now * 9) * 0.25);
    nikki.head.rotation.y = lerp(-steer * 0.7, -2.2, look); nikki.g.rotation.x = clamp(-st.lean * 1.2, -0.15, 0.15);

    // cyclists carry on, wobbling as the car goes past
    for (const c of cyclists) {
      const p = layout.cyclistAt(c.c, t), near = 1 - ramp(Math.abs(p.s - st.s), 3, 16);
      c.g.position.set(p.x, GROUND, p.z); c.g.rotation.y = -p.h + sin(now * 11 + c.c.sm) * 0.1 * near;
      c.lean.rotation.x = sin(now * 13 + c.c.sm) * 0.16 * near; const ped = p.s / 0.9; c.wheels[0].rotation.z = c.wheels[1].rotation.z = -p.s / bikeGeo.WR;
      c.p.legL.rotation.z = 0.9 + sin(ped) * 0.55; c.p.legR.rotation.z = 0.9 - sin(ped) * 0.55; c.p.head.rotation.y = near * (c.c.side > 0 ? 1 : -1) * 0.9;
      if (near > 0.5 && !c.rung) { c.rung = true; events?.bell?.(); }
    }
    // the cheese carriers dare not move: their heads follow the car as far as a neck goes, then whip round to the other shoulder
    const dcx = st.x - layout.donut.x, dcz = st.z - layout.donut.z, near = 1 - ramp(hypot(dcx, dcz), 30, 45), neck = clamp(turn(atan2(dcz, dcx) + carriers.rotation.y), -1.25, 1.25) * near;
    kaas.forEach((k, i) => { k.head.rotation.y = lerp(k.head.rotation.y, -neck, Math.min(1, dt * 10)); k.g.position.y = 0.55 + 0.02 * near * abs(sin(now * 18 + i * 2)); }); // and their knees knock
    { const b = layout.boat.at(t); tour.position.set(b.x, -1.2 + sin(now * 1.4) * 0.02, b.z); tour.rotation.set(sin(now * 1.1) * 0.012, -b.h, 0); } // -1.2: the canal's water level
    ducks.forEach((d, i) => { // waddling on the street, nose down off the quay, bobbing on the canal
      const q = DK.at(i, t), moved = hypot(q.x - d.g.position.x, q.z - d.g.position.z) > 1e-4;
      d.h = dt ? d.h + turn(q.h - d.h) * Math.min(1, dt * 9) : q.h; d.g.position.set(q.x, GROUND + q.y, q.z); d.g.rotation.y = -d.h; d.feet.visible = !q.wet; d.body.position.y = q.wet ? sin(now * 2.4 + i) * 0.012 : d.leg;
      d.body.rotation.x = q.land && moved ? sin(now * 13 + i * 1.7) * 0.24 : q.wet ? sin(now * 2.1 + i) * 0.05 : 0; d.body.rotation.z = q.land || q.wet ? 0 : -0.5;
      if (q.wet && !d.wet && dt) events?.plop?.(); d.wet = q.wet;
    });
    // the crowd shrinks back as the car comes in sideways
    const scare = ramp(st.s, drive.L - 26, drive.L - 6);
    crowd.forEach((p, i) => { p.g.rotation.z = 0; p.armL.rotation.z = p.armR.rotation.z = p.sign ? PI : scare * 2.6; p.armL.rotation.x = p.armR.rotation.x = 0; p.g.position.y = GROUND + 0.55; p.head.rotation.z = scare * 0.25; });
  }

  // after the car has stopped: T seconds of getting out, the stamp, the helmet coming off
  const CUE = { exDoor: 1.2, exOut: 1.7, exUp: 4.0, exTurn: 5.0, clipUp: 5.6, stamp: 6.4, nDoor: 7.6, nOut: 8.0, nStand: 8.55, nTurn: 8.8, roll: 9.4, hands: 10.6, reveal: 11.6, side: 14.03, hop: 14.4, wide: 14.65, card: 17 };
  function outro(T, dt, now, events, prevT) {
    const hit = (k) => prevT < CUE[k] && T >= CUE[k];
    smoke.update(dt); party.update(dt, now); talking = false;
    car.shell.rotation.z = 0.028 * Math.exp(-2.4 * T) * sin(7.5 * T); // the car rocks once on its springs as it stops
    car.doorR.rotation.y = 1.5 * ramp(T, CUE.exDoor, CUE.exDoor + 0.4); car.doorL.rotation.y = -1.35 * ramp(T, CUE.nDoor, CUE.nDoor + 0.4);
    // the examiner rolls out onto the road, lies there, gets up, stamps the form
    const out = ramp(T, CUE.exOut, CUE.exOut + 0.9), up = ramp(T, CUE.exUp, CUE.exUp + 0.9), turn = ramp(T, CUE.exTurn, CUE.exTurn + 0.5), raise = ramp(T, CUE.clipUp, CUE.clipUp + 0.5);
    setMood(T < CUE.exOut ? 'pray' : 'dazed');
    ex.g.position.set(-0.2, lerp(lerp(0.62, 0.42, ramp(out, 0.45, 1)) + sin(out * PI) * 0.25, 0.55, up), lerp(0.4, 1.75, out));
    ex.g.rotation.set(lerp(out * PI / 2, 0, up), -turn * PI / 2, T > CUE.exUp ? sin(now * 5) * 0.05 * up : 0); // falls out sideways like a plank
    sit(ex, 1 - ramp(out, 0.2, 0.7));
    const brace = ramp(T, 0.1, 0.6); // hands go up one last time as the car stops
    ex.armR.rotation.set(0, 0, lerp(lerp(1.1, 2.9, brace), 0.1, ramp(out, 0, 0.5))); const grab = ramp(T, 0.95, 1.5); ex.armL.rotation.set(0, 0, lerp(lerp(lerp(lerp(1.2, 2.75, brace), 1.0, ramp(T, 0.65, 0.95)), 0.1, ramp(out, 0, 0.5)), 2.9, raise)); // he clutches his clipboard before the door goes
    ex.head.rotation.set(0, 0, T > CUE.exUp ? sin(now * 3.1) * 0.12 : 0);
    if (hit('exOut')) events.whoosh?.(); if (prevT < CUE.exOut + 0.75 && T >= CUE.exOut + 0.75) events.thud?.();
    if (hit('stamp')) { sheet.material.map = papers.stamped; events.stamp?.(); }
    clip.scale.setScalar(1 + 0.5 * raise + 0.35 * Math.max(0, 1 - Math.abs(T - CUE.stamp - 0.08) * 6)); hold(grab, raise, 1 - ramp(out, 0, 0.18));
    // Nikki steps out on the quay side, turns round, takes the helmet off
    const nOut = ramp(T, CUE.nOut, CUE.nOut + 0.9), nStand = ramp(T, CUE.nStand, CUE.nStand + 0.45), nTurn = ramp(T, CUE.nTurn, CUE.nTurn + 0.7), hands = ramp(T, CUE.hands, CUE.hands + 0.6), rev = ramp(T, CUE.reveal, CUE.reveal + 0.5);
    const side = ramp(T, CUE.side, CUE.side + 0.35), hop = ramp(T, CUE.hop, CUE.hop + 0.6), land = CUE.hop + 0.6; // a skip to the back of the car, then up onto the boot for the photo. She goes up before she goes across, so nothing passes through the bodywork
    const joy = T > land ? Math.abs(sin((T - land) * 6.5)) : T > CUE.reveal + 0.5 && T < CUE.side ? Math.abs(sin((T - CUE.reveal - 0.5) * 6.5)) : 0; // CUE.side falls where a bounce ends
    nikki.g.position.set(lerp(-0.2, -1.5, side), lerp(0.62, 0.55, nStand) + sin(nOut * PI) * 0.12 + sin(side * PI) * 0.1 + 1.02 * ramp(hop, 0, 0.35) + sin(hop * PI) * 0.9 + joy * 0.28, lerp(lerp(-0.4, -1.6, nOut), 0, hop)); // 1.02: the boot lid is 1 m up
    nikki.g.rotation.set(0, nTurn * PI / 2 - hop * PI, 0); sit(nikki, 1 - nStand); nikki.head.rotation.set(0, 0, 0);
    const armUp = lerp(lerp(lerp(1.45, 0.1, ramp(nOut, 0, 0.4)), 2.5, hands), 2.9, rev);
    nikki.armL.rotation.set(-0.35 * hands * (1 - rev) - 0.5 * rev, 0, armUp); nikki.armR.rotation.set(0.35 * hands * (1 - rev) + 0.5 * rev, 0, armUp);
    if (hit('roll')) events.drumroll?.();
    if (hit('reveal')) { showHair(true); signMat.map = signs.after; car.root.attach(helmet); helmet.userData.v = [1.2, 5.5, -0.6]; events.reveal?.(); const p = nikki.head.getWorldPosition(V); party.burst(p.x, p.y + 1.5, p.z, 7); }
    if (T >= CUE.reveal && helmet.parent === car.root) { // tossed helmet: up, over, bounce, roll to a stop
      const v = helmet.userData.v; v[1] -= 14 * dt; helmet.position.x += v[0] * dt; helmet.position.y += v[1] * dt; helmet.position.z += v[2] * dt; helmet.rotation.z -= v[0] * dt * 3;
      if (helmet.position.y < 0.285) { helmet.position.y = 0.285; v[1] = Math.abs(v[1]) * 0.45; v[0] *= 0.6; v[2] *= 0.6; if (v[1] < 0.6) { v[0] = v[1] = v[2] = 0; } }
    } else if (T < CUE.reveal) helmet.position.y = hands * 0.02;
    if (T > CUE.reveal + 2.5 && Math.floor(T / 2.6) !== Math.floor(prevT / 2.6)) { const p = car.root.getWorldPosition(V); party.burst(p.x, 5, p.z, 12); }
    // crowd goes wild after the reveal
    crowd.forEach((p, i) => {
      const j = T > CUE.reveal ? Math.abs(sin(now * (6 + (i % 3)) + i)) : 0, calm = ramp(T, 0.5, 2.5);
      p.g.position.y = GROUND + 0.55 + j * 0.35; p.armL.rotation.z = p.armR.rotation.z = p.sign ? PI : T > CUE.reveal ? PI - 0.25 : 2.6 * (1 - calm); p.armL.rotation.x = p.sign ? 0 : -j * 0.4; p.armR.rotation.x = p.sign ? 0 : j * 0.4; p.head.rotation.z = 0; // whoever holds the banner keeps both fists on its poles
    });
    return CUE;
  }

  return { car, nikki, ex, smoke, party, frame, outro, reset, poke, CUE, get fear() { return fear; }, talk(on) { talking = on; } };
}
