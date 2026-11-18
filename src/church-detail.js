// Courses in the Grote Kerk run in metres around the walls. The little
// joints and cleft edges belong to the material, not the silhouette.
import * as THREE from 'three';
import { canvasTex, reliefTex } from './world.js';

function random(seed) {
  return () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);
}

const grey = (v) => `rgb(${v},${v},${v})`;
const masonry = { rows: 13, units: 6, seed: 812, palette: ['#e2dfd7','#e9e7df','#dad8d1','#dedcd4','#e8e6df','#d6d7cf'], grout: '#bcbcb3' };
const brick = { rows: 18, units: 5, seed: 511, palette: ['#d1b791','#c1a78f','#d7be9e','#d3ac98','#d1b5a1','#bfaa90'], grout: '#ccc6b5' };
const slate = { rows: 12, units: 10, seed: 716, palette: ['#c2c7ca','#b3b8bd','#b4bbbd','#b9bdbf','#c4c6c4','#aaafb5'], grout: '#80868a' };

function paintCourses(ctx, size, type, relief) {
  const r = random(type.seed), course = 512 / type.rows;
  ctx.scale(size / 512, size / 512);
  ctx.fillStyle = relief ? '#929292' : type.grout;
  ctx.fillRect(0, 0, 512, 512);
  for (let row = 0; row < type.rows; row++) {
    // The final block wraps around to the first at precisely the same height.
    const widths = Array.from({ length: type.units }, () => 0.76 + 0.48 * r());
    const total = widths.reduce((a, b) => a + b);
    let x = -((row % 2) * .45 + r() * .31) * 512 / type.units;
    for (const unit of widths) {
      const w = unit * 512 / total, y = row * course;
      const ink = type.palette[Math.floor(r() * type.palette.length)], chip = 1 + r() * 2;
      const face = grey(172 + Math.floor(r() * 15));
      for (const start of [x, x + 512]) {
        ctx.fillStyle = relief ? face : ink;
        ctx.beginPath();
        ctx.moveTo(start + chip, y + 1); ctx.lineTo(start + w - 1.1, y + .65);
        ctx.lineTo(start + w - 1.6, y + course - 1.9); ctx.lineTo(start + w - chip, y + course - .8);
        ctx.lineTo(start + 1, y + course - .9); ctx.closePath(); ctx.fill();
        ctx.fillStyle = relief ? '#c8c8c8' : 'rgba(255,252,239,.19)';
        ctx.fillRect(start + 3, y + 1.1, w - 7, type === slate ? .9 : 1.6);
        ctx.fillStyle = relief ? '#a3a3a3' : 'rgba(48,52,51,.08)';
        ctx.fillRect(start + 3, y + course - 2.6, w - 6, 1.4);
      }
      x += w;
    }
  }
  if (type === masonry && !relief) {
    // Soft patches of patina and lime bloom cross block boundaries. The same
    // patch is painted across each wrapped edge so no tile border appears.
    for (let i = 0; i < 64; i++) {
      const x = 512 * r(), y = 512 * r(), radius = 6 + 23 * r();
      const ink = i % 3 ? 'rgba(72,83,68,.12)' : 'rgba(250,247,231,.23)';
      for (const tx of [x - 512, x, x + 512]) for (const ty of [y - 512, y, y + 512]) {
        if (tx + radius < 0 || ty + radius < 0 || tx - radius > 512 || ty - radius > 512) continue;
        const wash = ctx.createRadialGradient(tx, ty, 0, tx, ty, radius);
        wash.addColorStop(0, ink); wash.addColorStop(1, 'rgba(128,136,119,0)');
        ctx.fillStyle = wash; ctx.fillRect(tx-radius, ty-radius, 2*radius, 2*radius);
      }
    }
  }
  // Uneven grain on cut stone and thin mineral streaks on cleft slates.
  for (let i = 0; i < 6800; i++) {
    const v = r();
    ctx.fillStyle = relief ? (v < .5 ? 'rgba(0,0,0,.045)' : 'rgba(255,255,255,.05)')
      : (v < .5 ? 'rgba(48,51,45,.075)' : 'rgba(255,255,245,.11)');
    ctx.fillRect(512 * r(), 512 * r(), .6 + r() * 3.5, type === slate ? .8 + r() * 4 : .7 + r() * 1.4);
  }
}

function surface(type, roughness) {
  const map = canvasTex(512, 512, (g, w) => paintCourses(g, w, type, false));
  const normalMap = reliefTex(256, 256, (g, w) => paintCourses(g, w, type, true), type === brick ? .85 : 1.05);
  return new THREE.MeshStandardMaterial({ map, normalMap, vertexColors: true, roughness });
}

let materials;
export function churchMaterials(fallback) {
  if (typeof document === 'undefined') return { stone: fallback.plain, brick: fallback.plain, roof: fallback.plain, glass: fallback.plain };
  if (materials) return materials;
  const glass = fallback.leaded.clone();
  glass.color.set('#aab4a5');
  glass.roughness = .39;
  glass.metalness = .035;
  materials = { stone: surface(masonry, .9), brick: surface(brick, .94), roof: surface(slate, .82), glass };
  return materials;
}

export function weatherStone(geometry) {
  const p = geometry.attributes.position, c = geometry.attributes.color;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const wash = .98 + .035 * Math.sin(x * .39 + z * .24) + .013 * Math.sin(x * .92 - y * .6);
    const damp = .12 * Math.max(0, 1 - y / 2.6);
    c.setXYZ(i, c.getX(i) * (wash - damp), c.getY(i) * (wash - damp * .77), c.getZ(i) * (wash - damp * .68));
  }
  return geometry;
}
