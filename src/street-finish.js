// All paving is painted onto the existing road/deck surfaces. The same little stone
// provides its fired face, recessed joint and roughness in each of the three tiles.
import * as THREE from 'three';
import { canvasTex, reliefTex } from './world.js';

function seed(x, y) {
  let a = Math.imul(x + 191, 374761393) ^ Math.imul(y + 73, 668265263);
  a = Math.imul(a ^ a >>> 13, 1274126177);
  return ((a ^ a >>> 16) >>> 0) / 4294967296;
}
function stone(g, mode, x, y, w, h, key, warm = false) {
  const tone = Math.round(207 + key * 43), drop = 1.3 + key * 1.5;
  const base = mode === 'colour' ? (warm ? `rgb(${tone},${tone-4},${tone-12})` : `rgb(${tone},${tone-1},${tone-3})`)
    : mode === 'height' ? `rgb(${160+key*46|0},0,0)` : `rgb(0,${175+key*48|0},0)`;
  g.fillStyle = base; g.beginPath(); g.roundRect(x + 0.9, y + 0.9, w - 1.8, h - 1.8, 1 + key * 1.3); g.fill();
  if (mode === 'roughness') return;
  g.fillStyle = mode === 'height' ? '#787878' : 'rgba(71,56,46,.20)';
  g.fillRect(x + 2, y + h - drop - 1, w - 4, drop);
  g.fillStyle = mode === 'height' ? '#bdbdbd' : 'rgba(255,250,232,.30)';
  g.fillRect(x + 3, y + 1.6, w - 7, 1);
  for (let i = 0; i < 7; i++) {
    const px = x + 3 + seed(i, key * 1000 | 0) * (w - 7), py = y + 3 + seed(i + 13, key * 1000 | 0) * (h - 7);
    g.fillStyle = mode === 'height' ? '#989898' : i % 3 ? 'rgba(74,58,41,.12)' : 'rgba(255,252,230,.42)';
    g.fillRect(px, py, i % 3 ? 1.7 : 2.6, 1.1);
  }
}
function brickwork(g, mode, kind) {
  g.fillStyle = mode === 'colour' ? '#aca398' : mode === 'height' ? '#343434' : '#00ef00';
  g.fillRect(0, 0, 512, 512);
  if (kind === 'footpath') {
    for (let row = 0; row < 16; row++) for (let col = -1; col < 8; col++) {
      stone(g,mode,(col + (row % 2) * 0.5) * 64,row * 32,64,32,seed((col + 8)%8,row),true);
    }
  } else {
    const repeats = kind === 'road' ? 2 : 1, cells = 16 * repeats;
    g.save(); g.scale(1 / repeats, 1 / repeats);
    for (let row = -2; row <= cells; row++) for (let col = -2; col <= cells; col++) {
      const k = ((col - row) % 4 + 4) % 4;
      if (k === 0 || k === 3) stone(g, mode, col * 32, row * 32, k ? 32 : 64, k ? 64 : 32, seed((col+cells)%cells,(row+cells)%cells), kind === 'walk');
    }
    g.restore();
  }
  if (kind === 'road') {
    // A pair of soldier courses drains each side of the same paved carriageway.
    for (const y of [0, 488]) for (let col = -1; col < 24; col++) {
      const width = 512/24;
      stone(g,mode,col*width,y,width,24,seed((col+24)%24,91));
    }
    for (const [x,y] of [[96,1],[354,489]]) {
      g.fillStyle = mode === 'colour' ? '#535653' : mode === 'height' ? '#737373' : '#007000';
      g.fillRect(x,y,40,22);
      g.fillStyle = mode === 'colour' ? '#202932' : mode === 'height' ? '#333' : '#00c000';
      for (let i=0;i<6;i++) g.fillRect(x+3+i*6,y+3,3,16);
    }
  }
}
function square(g,mode) {
  const colour = mode === 'colour', height = mode === 'height';
  g.fillStyle = colour ? '#b6ad9a' : height ? '#4d4d4d' : '#00f400'; g.fillRect(0,0,512,512);
  // Stagger half-discs so the next course closes the spaces between neighbouring fans.
  for (let row = -1; row < 7; row++) for (let column = -1; column <= 3; column++) {
    const cx = column * 256 + (row & 1) * 128, cy = row * 128;
    g.fillStyle = colour ? '#a9a18e' : height ? '#646464' : '#00ed00';
    g.beginPath(); g.arc(cx,cy,185,Math.PI,2*Math.PI); g.fill();
    for (let ring = 0; ring < 10; ring++) {
      const inner = ring * 18.5 + 0.8, outer = (ring + 1) * 18.5 - 0.6;
      const count = Math.max(2, Math.round(Math.PI * (inner+outer)/40));
      const joint = 0.5 / outer;
      for (let k = 0; k < count; k++) {
        const a = Math.PI + k * Math.PI / count + joint, b = Math.PI + (k+1) * Math.PI / count - joint;
        const v = seed(k + ring * 37, (row + 4) % 4 + ((column + 2) % 2) * 4), t = 204 + (v * 46 | 0);
        g.fillStyle = colour ? `rgb(${t},${t-3},${t-9})` : height ? `rgb(${158 + v*56|0},0,0)` : `rgb(0,${179 + v*42|0},0)`;
        g.beginPath(); g.arc(cx,cy,outer,a,b); g.arc(cx,cy,inner,b,a,true); g.closePath(); g.fill();
      }
    }
  }
}
function coping(g,mode) {
  g.fillStyle = mode === 'colour' ? '#79796f' : mode === 'height' ? '#343434' : '#00f000';
  g.fillRect(0,0,512,512);
  for(let i=0;i<4;i++)stone(g,mode,i*128,0,128,512,seed(i,96));
}
function turf(g,mode) {
  g.fillStyle = mode === 'colour' ? '#d4e1b8' : mode === 'height' ? '#888' : '#00ed00'; g.fillRect(0,0,512,512);
  if(mode === 'roughness')return;
  for(let k=0;k<2400;k++){
    const x=seed(k,11)*512,y=seed(k,12)*512,s=seed(k,19);
    g.strokeStyle = mode==='colour' ? (k%3?'rgba(71,100,47,.18)':'rgba(255,250,196,.55)') : (k%2?'#777':'#a5a5a5');
    g.lineWidth = 1+s*2; g.beginPath();g.moveTo(x-2,y-1);g.lineTo(x,y);g.lineTo(x+2+s,y-3-s*2);g.stroke();
  }
}
export function streetFinish(kind) {
  const paint=(g,mode,w)=>{g.save();g.scale(w/512,w/512);
    if(kind==='square')square(g,mode);else if(kind==='kerb')coping(g,mode);else if(kind==='grass')turf(g,mode);else brickwork(g,mode,kind);
    g.restore();
  };
  const map=canvasTex(512,512,(g,w)=>paint(g,'colour',w));
  const normalMap=reliefTex(256,256,(g,w)=>paint(g,'height',w),kind==='grass'?0.65:1.25);
  const roughnessMap=canvasTex(128,128,(g,w)=>paint(g,'roughness',w));roughnessMap.colorSpace=THREE.NoColorSpace;
  return {map,normalMap,roughnessMap,roughness:1,normalScale:new THREE.Vector2(0.64,0.64)};
}

export function asphaltGrain(g,w,h,span) {
  // The original lane paint is applied after the aggregate, tar repairs and wheel-polished strips.
  for(let i=0;i<5600;i++){
    const n=seed(i,8);g.fillStyle=n<0.6?'rgba(13,17,22,.13)':'rgba(212,210,194,.15)';
    g.fillRect(seed(i,22)*w,seed(i,23)*h,0.7+n*1.9,0.7+n*1.5);
  }
  const lane=3.5*h/span;
  for(let centre=lane/2;centre<h;centre+=lane)for(const off of [-0.78,0.78]){
    const y=centre+off*h/span,r=lane*0.12,fade=g.createLinearGradient(0,y-r,0,y+r);
    fade.addColorStop(0,'rgba(14,18,24,0)');fade.addColorStop(.5,'rgba(14,18,24,.18)');fade.addColorStop(1,'rgba(14,18,24,0)');
    g.fillStyle=fade;g.fillRect(0,y-r,w,2*r);
  }
  g.lineWidth=1.7;g.strokeStyle='rgba(20,23,29,.37)';
  g.beginPath();g.moveTo(w*.44,h*.03);g.lineTo(w*.48,h*.09);g.lineTo(w*.47,h*.11);g.lineTo(w*.55,h*.16);g.stroke();
}
