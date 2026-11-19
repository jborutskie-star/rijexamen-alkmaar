// The set pieces: the roadworks and plank ramp on the Langestraat, the fireworks stall on the Zoutstraat,
// and everything that goes bang. Where things stand comes from drive.js, so tools/check.mjs tests the same layout.
import { packPaintedParts } from './painted-parts.js';
import { batchCastSolids } from './cast-solids.js';
import * as THREE from 'three';
import { mat, canvasTex, reliefTex, fuse as fuseGeometry, GROUND } from './world.js';
import { clamp, smooth } from './drive.js';
import { person, puffs, smokeTexture, FONT } from './actors.js';

const { PI, sin, cos, random, hypot, sqrt, exp, atan2 } = Math;
const ramp = (t, a, b) => smooth((t - a) / (b - a));
const tex = (w, h, draw) => canvasTex(w, h, draw, false);
const COLS = ['#ff4d6d', '#ffd23f', '#4dd6ff', '#7dff7a', '#ff8a3d', '#d58bff', '#ffffff'];
const glow = (color, o = {}) => new THREE.MeshBasicMaterial({ color, fog: false, toneMapped: false, ...o });

// Tapered embers show a short streak in the direction of travel. Only live sparks enter the draw.
function sparks(scene, n) {
  const profile = [[0,-.38],[.048,-.13],[.091,.07],[.066,.14],[0,.18]];
  const shape = new THREE.LatheGeometry(profile.map(([r,y])=>new THREE.Vector2(r,y)),5);
  const pigment = [], color = new THREE.Color();
  for (let i=0;i<shape.attributes.position.count;i++) {
    const t = (shape.attributes.position.getY(i)+.38)/.56;
    pigment.push(.48+.52*t,.27+.73*t,.16+.84*t);
  }
  shape.setAttribute('color',new THREE.Float32BufferAttribute(pigment,3));
  const mesh = new THREE.InstancedMesh(shape,glow('#ffffff',{vertexColors:true}),n);
  const particles = Array.from({length:n},()=>({life:0}));
  const pose = new THREE.Object3D(), velocity = new THREE.Vector3(), up = new THREE.Vector3(0,1,0);
  let next = 0, active = 0;
  mesh.frustumCulled = false; mesh.visible = false; mesh.count = 0; scene.add(mesh);
  return {
    emit(x,y,z,vx,vy,vz,life,size,col,g=6) {
      if (particles[next].life===0) active++;
      Object.assign(particles[next],{x,y,z,vx,vy,vz,life,size,col,g,age:0});
      next=(next+1)%n;
    },
    update(dt) {
      if (!active) return;
      let count=0;
      for (const p of particles) {
        if (!p.life) continue;
        p.age+=dt;
        if (p.age>=p.life) { p.life=0; active--; continue; }
        const drag=1-1.3*dt;
        p.vy=(p.vy-p.g*dt)*drag; p.vx*=drag; p.vz*=drag;
        p.x+=p.vx*dt; p.y+=p.vy*dt; p.z+=p.vz*dt;
        const size=p.size*(1-(p.age/p.life)**2);
        velocity.set(p.vx,p.vy,p.vz);
        pose.position.set(p.x,p.y,p.z);
        pose.scale.set(size,size*(.52+Math.min(1.5,velocity.length()*.12)),size);
        pose.quaternion.setFromUnitVectors(up,velocity.normalize()); pose.updateMatrix();
        mesh.setMatrixAt(count,pose.matrix); mesh.setColorAt(count++,color.set(p.col));
      }
      mesh.count=count;
      mesh.visible=count>0;
      if (count) for (const attribute of [mesh.instanceMatrix,mesh.instanceColor]) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0,count*attribute.itemSize);
        attribute.needsUpdate=true;
      }
    },
    clear() { for (const p of particles) p.life=0; active=mesh.count=0; mesh.visible=false; },
  };
}

// planks and crates thrown out of the stall; they bounce off walls and the street and stay where they land
function debris(scene, world, n) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat('#ffffff', { roughness: 0.85 }), n), D = new THREE.Object3D(), C = new THREE.Color();
  const P = Array.from({ length: n }, () => ({ on: false })), WOOD = ['#b5834f', '#8a5a3a', '#2a2522', '#e0202a', '#f4f1e6', '#3a3330'];
  const hide = () => { mesh.count = 0; mesh.visible = false; for (const p of P) p.on = false; };
  P.forEach((_, i) => mesh.setColorAt(i, C.set(WOOD[i % WOOD.length]))); hide(); mesh.castShadow = true; mesh.frustumCulled = false; scene.add(mesh);
  return {
    clear: hide,
    burst(x, z, ax, az) { mesh.visible = true; mesh.count = n; // ax, az: the way to the open street; most of it flies that way
      P.forEach((p, i) => {
        const a = random() * 2 * PI, v = 2 + random() * 6, plank = i % 3;
        Object.assign(p, { on: true, x: x + cos(a) * 0.5, y: GROUND + 0.6 + random() * 1.2, z: z + sin(a) * 0.5, vx: cos(a) * v + ax * 3, vy: 5 + random() * 8, vz: sin(a) * v + az * 3,
          sx: plank ? 0.5 + random() * 0.8 : 0.3, sy: plank ? 0.05 : 0.25, sz: plank ? 0.14 : 0.3, rx: random() * 6, ry: random() * 6, rz: random() * 6, w: 4 + random() * 9 });
      });
    },
    update(dt) {
      if (!mesh.count) return;
      P.forEach((p, i) => {
        if (!p.on) return; const floor = GROUND + p.sy / 2 + 0.005;
        if (p.vy !== 0 || p.y > floor) {
          p.vy -= 12 * dt; const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
          if (world.inside(nx, p.y, nz)) { p.vx *= -0.35; p.vz *= -0.35; } else { p.x = nx; p.z = nz; }
          p.y += p.vy * dt; p.rx += p.w * dt; p.rz += p.w * 0.7 * dt;
          if (p.y < floor) { p.y = floor; if (p.vy < -2.5) { p.vy *= -0.3; p.vx *= 0.5; p.vz *= 0.5; p.w *= 0.4; } else { p.vy = p.vx = p.vz = 0; p.rx = p.rz = 0; } } // comes to rest lying flat
        }
        D.position.set(p.x, p.y, p.z); D.rotation.set(p.rx, p.ry, p.rz); D.scale.set(p.sx, p.sy, p.sz); D.updateMatrix(); mesh.setMatrixAt(i, D.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// One timber tile for the ramp, its supports and the market counter. The screws and
// grain are painted into the existing surfaces, so even the ramp's wheel contact stays exact.
function timber(g, bump) {
  const rng = (k) => (Math.imul(k+57,2654435761)>>>8)/16777216;
  for (let row=0;row<6;row++) {
    const y=row*32, tone=219+Math.floor(rng(row)*29);
    g.fillStyle=bump?'#aaa':`rgb(${tone},${tone},${tone})`;
    g.fillRect(0,y,256,32);
    g.fillStyle=bump?'#555':'#9b8979'; g.fillRect(0,y,256,2);
    g.fillStyle=bump?'#cecece':'#f9f5e8'; g.fillRect(0,y+2,256,1.5);
    for (let line=0;line<5;line++) {
      const mid=y+5+line*5, phase=rng(row*11+line)*6;
      g.beginPath();
      for(let x=0;x<=256;x+=4) {
        const v=mid+sin(x/26+phase)*1.5+sin(x/7+phase)*.4;
        if(x)g.lineTo(x,v); else g.moveTo(x,v);
      }
      g.lineWidth=line%2?.8:1.2; g.strokeStyle=bump?'#929292':'rgba(99,67,42,.22)'; g.stroke();
    }
    const knot=43+row*39%161;
    for (const r of [6,3]) {
      g.strokeStyle=bump?'#777':'rgba(113,80,49,.46)'; g.lineWidth=1.2;
      g.beginPath(); g.ellipse(knot,y+15,r,r*.26,0,0,2*PI); g.stroke();
    }
    for (const x of [13,122,233]) for(const dy of [7,25]) {
      g.fillStyle=bump?'#888':'#766c5e'; g.fillRect(x-1.5,y+dy-1.5,3,3);
      g.fillStyle=bump?'#bdbdbd':'#c4c4b6'; g.fillRect(x-1,y+dy-1,2,1);
    }
  }
}

function trackAtlas() {
  return tex(384,128,(g) => {
    g.fillStyle='#2e3137'; g.fillRect(0,0,384,128);
    g.fillStyle='#454951'; g.beginPath(); g.roundRect(5,5,374,70,30); g.fill();
    g.fillStyle='#20252b'; g.beginPath(); g.roundRect(11,12,362,55,23); g.fill();
    for(let i=0;i<6;i++) {
      const x=41+i*60.5;
      for (const [r,colour] of [[24,'#63676a'],[19,'#474b50'],[12,'#33383b'],[6,'#aa9b75']]) {
        g.fillStyle=colour; g.beginPath(); g.arc(x,40,r,0,2*PI); g.fill();
      }
    }
    for(let x=3;x<384;x+=15) {
      g.fillStyle='#686965'; g.fillRect(x,2,10,4); g.fillRect(x,74,10,4); g.fillRect(x,83,10,43);
      g.fillStyle='#393b3a'; g.fillRect(x+2,84,3,41);
    }
  });
}

function machinePaint() {
  return tex(128,256,(g) => {
    g.fillStyle='#f7c400';g.fillRect(0,0,128,256);
    // Cab above, engine cover below. The rest of the shell keeps the original yellow enamel.
    g.fillStyle='#333b40';g.fillRect(11,11,106,69);
    const glass=g.createLinearGradient(0,14,0,78);
    glass.addColorStop(0,'#7999a6');glass.addColorStop(.57,'#3d586a');glass.addColorStop(1,'#22344a');
    g.fillStyle=glass;g.fillRect(15,15,61,61);g.fillRect(81,15,32,61);
    g.strokeStyle='#cd9908';g.lineWidth=2;g.strokeRect(8,7,73,112);
    g.fillStyle='#353b38';g.fillRect(58,86,15,4);
    g.fillStyle='#d5a506';g.fillRect(8,229,112,3);
    for(let i=0;i<8;i++) {
      g.fillStyle='#513f1e';g.fillRect(16+i*8,161,4,35);
      g.fillStyle='#fbd64b';g.fillRect(20+i*8,161,2,35);
    }
    g.strokeStyle='#b88f08';g.strokeRect(10,151,75,56);
    g.fillStyle='#c2beb0';g.fillRect(91,169,13,7);
  });
}

function machineSide(mesh,finish,top,bottom) {
  mesh.material.map=finish; mesh.material.color.set('#ffffff'); mesh.material.roughness=.49;
  const uv=mesh.geometry.attributes.uv;
  for(let i=0;i<uv.count;i++) {
    if(i<16) uv.setXY(i,.005,.992);
    else uv.setY(i,bottom+(top-bottom)*uv.getY(i));
  }
  return mesh;
}

function wrapperAtlas() {
  return tex(128,128,(g) => {
    g.fillStyle='#fff';g.fillRect(0,0,128,128);
    for(const y of [6,14,106,116]) {
      g.fillStyle=y%4?'#9c9a95':'#5f6270';g.fillRect(0,y,128,3);
    }
    for(let i=-1;i<4;i++) {
      const x=i*40+2;g.fillStyle='#8f8e98';g.beginPath();g.moveTo(x,25);g.lineTo(x+13,25);g.lineTo(x+2,46);g.lineTo(x-11,46);g.fill();
    }
    g.fillStyle='#48485b';g.fillRect(0,55,128,40);
    for(const x of [31,95]) {
      g.beginPath();
      for(let i=0;i<12;i++) {
        const t=i*PI/6, r=i%2?5:16, px=x+cos(t)*r, py=75+sin(t)*r;
        if(i)g.lineTo(px,py);else g.moveTo(px,py);
      }
      g.closePath();g.fillStyle='#fff';g.fill();
    }
  });
}

export function buildStunts(scene, world, drive) {
  const { layout } = drive, b = world.box, bm = world.beam, H = layout.hop, B = layout.boom;
  const put = (o, hd) => { const g = new THREE.Group(); g.position.set(o.x, GROUND, o.z); g.rotation.y = -hd; scene.add(g); return g; };
  const stripes = (a, c) => tex(64, 64, (g) => { g.fillStyle = a; g.fillRect(0, 0, 64, 64); g.fillStyle = c; g.fillRect(0, 0, 16, 64); g.fillRect(32, 0, 16, 64);
    g.fillStyle='rgba(56,52,49,.22)'; g.fillRect(0,0,64,4); g.fillRect(0,59,64,5);
    g.fillStyle='rgba(255,255,255,.6)';g.fillRect(0,4,64,2);
    for(const x of [3,59]){g.fillStyle='#727979';g.fillRect(x,7,2,3);}
  });
  const redWhite = stripes('#f4f1e6', '#e0202a');
  const timberFinish = {map:tex(256,192,g=>timber(g,false)),normalMap:reliefTex(256,192,g=>timber(g,true),1.05),roughness:.84};
  const foil = wrapperAtlas(), tracks = trackAtlas(), enamel=machinePaint();
  const reflector = tex(64,32,(g) => {
    g.fillStyle='#eff1e8';g.fillRect(0,0,64,32);
    g.fillStyle='#bdc4bf'; g.fillRect(0,0,64,3);g.fillRect(0,29,64,3);
    g.fillStyle='#d5dcd4';
    for(let y=5;y<28;y+=5)for(let x=(y%2)*3;x<64;x+=6)g.fillRect(x,y,2,2);
  });

  // ---- roadworks on the Langestraat: a builder's plank makes a fine ramp ----
  const hd = H.h, len = H.s1 - H.s0, run = len / cos(H.angle), tan = Math.tan(H.angle);
  const rampG = put(H, hd), tilt = (me) => { me.rotation.z = H.angle; return me; };
  rampG.add(tilt(b(run, 0.08, 2.7, '#c9a26b', len / 2, H.tipY / 2 - 0.085, 0,timberFinish)), b(1.0, 0.92, 2.4, '#8a6a45', len - 0.55, 0.46, 0,timberFinish), b(0.8, 0.4, 2.4, '#8a6a45', 2.9, 0.2, 0,timberFinish));
  for (let i = 0; i < 8; i++) for (const z of [-1.34, 1.34]) { const x = ((i + 0.5) / 8) * len; rampG.add(tilt(b(run / 8, 0.16, 0.07, i % 2 ? '#22242a' : '#f7c400', x, x * tan - 0.02, z))); }
  const paddlePrint = tex(128,128,c => {
    c.fillStyle='#f7efe1'; c.fillRect(0,0,128,128);
    c.fillStyle='#c92632'; c.beginPath(); c.arc(64,64,55,0,2*PI); c.fill();
    c.font='bold 38px Arial'; c.textAlign='center'; c.textBaseline='middle';
    c.fillStyle='#fff8e5'; c.fillText('STOP',64,65);
  });
  const paddleGeometry=new THREE.CylinderGeometry(.137,.137,.027,24).rotateX(PI/2);
  // The round ends carry the same upright print when viewed from their respective sides. The rim samples ivory.
  const paddleUV=paddleGeometry.attributes.uv, paddlePos=paddleGeometry.attributes.position, paddleNormal=paddleGeometry.attributes.normal;
  for(let i=0;i<paddleUV.count;i++){
    const side=paddleNormal.getZ(i);
    if(Math.abs(side)<.9)paddleUV.setXY(i,.02,.02);
    else paddleUV.setXY(i,.5+Math.sign(side)*paddlePos.getX(i)/.274,.5+paddlePos.getY(i)/.274);
  }
  const paddleMaterial=mat('#ffffff',{map:paddlePrint,roughness:.45});
  const workers = [], repeated = new Map();
  for (const o of layout.works) {
    if (repeated.has(o.kind)) {
      repeated.get(o.kind).positions.push(o);
      continue;
    }
    const g = put(o, hd);
    if (o.kind === 'fence') g.add(b(0.05, 0.2, 0.86, '#ffffff', 0, 0.9, 0, { map: redWhite }), b(0.05, 0.2, 0.86, '#ffffff', 0, 0.52, 0, { map: redWhite }), b(0.07, 1.0, 0.07, '#8f949e', 0.02, 0.5, -0.36), b(0.07, 1.0, 0.07, '#8f949e', 0.02, 0.5, 0.36), b(0.5, 0.07, 0.14, '#f7c400', 0.02, 0.035, -0.36), b(0.5, 0.07, 0.14, '#f7c400', 0.02, 0.035, 0.36));
    else if (o.kind === 'cone') {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.56, 12), mat('#ff6a13',{roughness:.47})), band = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.135, 0.1, 12), mat('#ffffff',{map:reflector,roughness:.27,metalness:.2}));
      cone.position.y = 0.32; band.position.y = 0.33; cone.castShadow = true; g.add(cone, band, b(0.44, 0.04, 0.44, '#ff6a13', 0, 0.02, 0));
    } else if (o.kind === 'pit') {
      const sand = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), mat('#d9b877', { flatShading: true, roughness: 1 })); sand.scale.set(1.0, 0.45, 0.9); sand.position.set(0.5, 0, 0.1); sand.castShadow = true;
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 20), mat('#17181b')), lid = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 20), mat('#5c6068', { metalness: 0.4 }));
      hole.position.set(-0.95, 0.02, 0); lid.position.set(-0.8, 0.2, 0.75); lid.rotation.x = 1.15; g.add(sand, hole, lid, bm([0.5, 0.3, 0.1], [0.2, 1.25, -0.2], 0.05, '#8a5a3a'), b(0.2, 0.26, 0.04, '#8f949e', 0.53, 0.26, 0.13));
    } else if (o.kind === 'worker') {
      const p = person(b, { shirt: '#ff7a1a', pants: '#2d3142', skin: workers.length ? '#8d5a3c' : '#f1c9a5', hair: null, face: 'o' }), side = Math.sign((o.x - H.x) * -sin(hd) + (o.z - H.z) * cos(hd)); // which side of the street
      const hat = new THREE.Mesh(new THREE.SphereGeometry(0.225, 16, 8, 0, PI * 2, 0, PI / 2), mat('#f7c400', { roughness: 0.4 })); hat.position.y = 0.05; p.head.add(hat, b(0.12, 0.03, 0.3, '#f7c400', 0.2, 0.06, 0));
      const safetyStrips = fuseGeometry(
        [new THREE.BoxGeometry(.275,.065,.515),'#e2e5da',0,.28,0],
        [new THREE.BoxGeometry(.275,.06,.515),'#e2e5da',0,.13,0],
        ...[-.146,.146].map(z=>[new THREE.BoxGeometry(.02,.19,.052),'#eee9cc',.134,.405,z]));
      p.g.add(new THREE.Mesh(safetyStrips,mat('#ffffff',{vertexColors:true})));
      const disc = new THREE.Mesh(paddleGeometry,paddleMaterial);
      disc.position.set(.064,-.481,.072); disc.rotation.z = -2.55;
      p.armR.add(b(.045,.13,.045,'#334047',.053,-.435,0),disc);
      batchCastSolids(p.g, 2.7);
      p.g.position.y = 0.55; g.rotation.y = -(hd - side * PI / 2); g.add(p.g); workers.push({ p, o, face: hd - side * PI / 2 }); // facing the street
    } else if (o.kind === 'digger') {
      const arm = new THREE.Group(); arm.position.set(0.3, 0.95, 0.28); arm.add(bm([0, 0, 0], [0.4, 1.1, 0], 0.14, '#f7c400'), bm([0.4, 1.1, 0], [0.75, 0.5, 0], 0.11, '#f7c400'), b(0.3, 0.3, 0.42, '#2b2e36', 0.78, 0.36, 0));
      const tread = (z) => {
        const shell=b(1.9,0.4,0.34,'#ffffff',0,0.2,z,{map:tracks,roughness:.88});
        const uv=shell.geometry.attributes.uv;
        for(let i=0;i<uv.count;i++) {
          // BoxGeometry's last two faces are the long sides; the strip wraps the four narrow faces.
          const v=uv.getY(i); uv.setY(i,i>=16?.375+v*.625:v*.35);
        }
        return shell;
      };
      g.add(tread(-0.44),tread(0.44), machineSide(b(1.3, 0.5, 1.0, '#f7c400', -0.1, 0.66, 0),enamel,.5,0), machineSide(b(0.7, 0.8, 0.66, '#f7c400', -0.35, 1.31, -0.12),enamel,1,.5), b(0.74, 0.42, 0.5, '#22344a', -0.35, 1.4, -0.12, { roughness: 0.2 }), b(0.14, 0.1, 0.14, '#ff9a1a', -0.35, 1.76, -0.12, { emissive: '#ff8a00', emissiveIntensity: 1 }), arm);
      g.userData.arm = arm; workers.digger = g;
    } else if (o.kind === 'sign') {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.84), new THREE.MeshStandardMaterial({ map: tex(256, 256, (c) => { c.fillStyle = '#f7c400'; c.fillRect(0, 0, 256, 256); c.strokeStyle = '#14161c'; c.lineWidth = 12; c.strokeRect(10, 10, 236, 236); c.fillStyle = '#14161c'; c.textAlign = 'center'; c.font = `400 44px ${FONT}`; c.fillText('WERK IN', 128, 96); c.font = `400 34px ${FONT}`; c.fillText('UITVOERING', 128, 146); c.font = `400 30px ${FONT}`; c.fillText('langzaam!', 128, 206); }) }));
      board.rotation.y = -PI / 2; board.position.set(-0.012, 1.55, 0); g.add(board, b(0.04, 0.88, 0.88, '#b99300', 0.02, 1.55, 0), b(0.06, 1.15, 0.06, '#8f949e', 0.03, 0.575, -0.3), b(0.06, 1.15, 0.06, '#8f949e', 0.03, 0.575, 0.3));
    }
    if (o.kind === 'fence' || o.kind === 'cone') {
      repeated.set(o.kind, {model:g, positions:[o]});
      scene.remove(g);
    }
  }
  // The ten construction fences and eight cones use identical hardware. Keep
  // each finish and its shadow settings, and submit all copies together.
  const pose = new THREE.Object3D(), instance = new THREE.Matrix4();
  for (const {model, positions} of repeated.values()) {
    packPaintedParts(model);
    pose.rotation.copy(model.rotation);
    for (const part of model.children) {
      part.updateMatrix();
      const copies = new THREE.InstancedMesh(part.geometry,part.material,positions.length);
      copies.castShadow = part.castShadow;
      copies.receiveShadow = part.receiveShadow;
      copies.userData.fixedInstances = true;
      positions.forEach((o,i) => {
        pose.position.set(o.x,GROUND,o.z);
        pose.updateMatrix();
        copies.setMatrixAt(i,instance.multiplyMatrices(pose.matrix,part.matrix));
      });
      scene.add(copies);
    }
  }
  packPaintedParts(rampG);

  // ---- the fireworks stall on the Zoutstraat ----
  const B_S = B.s, bh = drive.centre(B_S).h, ax = sin(bh), az = -cos(bh), E = { x: B.x + ax * 0.8, z: B.z + az * 0.8 }; // (ax, az): from the stall towards the middle of the street
  const stall = put(B, bh), wreck = put(B, bh);
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 0.38), new THREE.MeshStandardMaterial({ map: tex(512, 104, (c) => { c.fillStyle = '#14213d'; c.fillRect(0, 0, 512, 104); c.strokeStyle='#94989b'; c.lineWidth=2; c.strokeRect(5,5,502,94); c.fillStyle='#cbb788'; for(const x of [14,498])for(const y of [14,90])c.fillRect(x-2,y-2,4,4); c.fillStyle = '#ffd23f'; c.textAlign = 'center'; c.font = `400 78px ${FONT}`; c.fillText('VUURWERK', 256, 80); }) }));
  banner.rotation.y = PI; banner.position.set(0, 1.95, -0.645);
  const roof = b(2.2, 0.07, 1.22, '#ffffff', 0, 2.3, 0, { map: redWhite }); roof.rotation.x = 0.1;
  stall.add(b(2.0, 0.85, 0.8, '#b5834f', 0, 0.425, 0.1,timberFinish), b(2.06, 0.3, 0.86, '#ffffff', 0, 0.62, 0.1, { map: redWhite }), roof, b(1.9, 0.42, 0.04, '#14213d', 0, 1.95, -0.62), banner, b(0.9, 0.2, 0.5, '#8a5a3a', -0.4, 0.95, 0.1,timberFinish));
  for (const x of [-0.95, 0.95]) for (const z of [-0.5, 0.5]) stall.add(b(0.07, 2.25, 0.07, '#e8e2d0', x, 1.125, z));
  for (let i = 0; i < 7; i++) {
    const r = new THREE.Group(), body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 8), mat(COLS[i % 6],{map:foil,roughness:.43,metalness:.13})), tip = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.14, 8), mat('#e0202a',{roughness:.34}));
    body.position.y = 0.18; tip.position.y = 0.43; r.add(body, tip, b(0.012, 0.3, 0.012, '#8a5a3a', 0.05, -0.1, 0));
    if (i === 6) { r.scale.setScalar(2.4); r.position.set(0.55, 1.05, 0.05); r.rotation.z = -0.3; } else { r.position.set(-0.72 + i * 0.13, 1.1, 0.02 + (i % 2) * 0.14); r.rotation.z = (i - 2.5) * 0.06; }
    stall.add(r);
    for (const part of [...r.children]) stall.attach(part);
    stall.remove(r);
  }
  packPaintedParts(stall);
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(2.6, 28), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: tex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 6, 64, 64, 64); g.addColorStop(0, 'rgba(12,10,9,.85)'); g.addColorStop(0.6, 'rgba(12,10,9,.5)'); g.addColorStop(1, 'rgba(12,10,9,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }) }));
  scorch.rotation.x = -PI / 2; scorch.position.set(0, 0.03, -0.5);
  const black = '#1b1918'; wreck.add(scorch, b(1.7, 0.22, 0.7, black, 0.1, 0.11, 0.1), b(0.6, 0.4, 0.5, black, -0.6, 0.2, 0.2), bm([-0.95, 0, 0.5], [-0.6, 1.5, 0.3], 0.07, black), bm([0.95, 0, 0.5], [1.1, 1.1, 0.4], 0.07, black), bm([0.95, 0, -0.5], [0.2, 0.5, -0.3], 0.07, black));
  for (let i = 0; i < 5; i++) wreck.add(b(0.1, 0.06, 0.1, '#ff7a1a', -0.6 + i * 0.3, 0.26, 0.1 + (i % 2) * 0.2, { emissive: '#ff5a00', emissiveIntensity: 2 }));
  const flames = [[-0.6, 0.4, 0.2, 0.2], [0.1, 0.22, 0.1, 0.26], [0.6, 0.22, 0.25, 0.18], [-0.15, 0.22, -0.1, 0.15]].map(([x, y, z, r], i) => { const f = new THREE.Mesh(new THREE.ConeGeometry(r, 0.9, 7), glow(i % 2 ? '#ffd23f' : '#ff7a1a')); f.userData.at = [x, y, z]; wreck.add(f); return f; }); // what is left of the stall burns for a while
  wreck.visible = false;

  // ---- what an explosion is made of ----
  const fx = sparks(scene, 1100), bits = debris(scene, world, 54), soot = puffs(scene, 150, '#3a3836');
  // Fire, tyre smoke and cooling soot share a tufted edge. The rising outer billows cool first.
  const plume = (color,order,rotation) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:smokeTexture(),color,transparent:true,depthWrite:false,rotation,toneMapped:false}));
    sprite.renderOrder=order; sprite.visible=false; scene.add(sprite); return sprite;
  };
  const balls = [['#fff5c0',2.0],['#ffaf30',3.0],['#ff5a14',3.9]].map(([color,r],i)=>{
    const o=plume(color,5-i,i*2.28); o.userData.r=r;
    if (i===0) o.material.blending=THREE.AdditiveBlending;
    o.material.color.multiplyScalar(i===0?1.6:1.15); o.position.set(E.x,GROUND+1.3,E.z); return o;
  });
  const hot = new THREE.Color('#ff7c21'), sootColor = new THREE.Color('#514b49');
  const lobes=Array.from({length:10},(_,i)=>{
    const a=i*2.4,u=.12+i%4*.22,q=sqrt(1-u*u),o=plume('#ff8434',2,i*1.46);
    Object.assign(o.userData,{dx:cos(a)*q+ax*.7,dy:u,dz:sin(a)*q+az*.7,r:.8+i%3*.25,up:.78+i%4*.42});
    return o;
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(.94,1,48),glow('#ffdea2',{transparent:true,depthWrite:false,side:THREE.DoubleSide}));
  ring.rotation.x=-PI/2; ring.position.set(E.x,GROUND+.08,E.z); ring.visible=false; scene.add(ring);
  const flash = new THREE.PointLight('#ffb060', 0, 70, 1.7); flash.position.set(E.x, GROUND + 3, E.z); scene.add(flash); // made now, switched on later: adding a light mid-film would stall a frame

  const rockets = []; let age = -1, fuse = 0, left = 0, show = 0, showAt = null, lastS = 0;
  const launch = (x, y, z, vx, vz, col) => rockets.push({ x, y, z, vx, vy: 16 + random() * 9, vz, fuse: 0.75 + random() * 0.55, col });

  // s: where the film starts, so jumping in past the stall does not set it off
  function reset(s = 0) { age = -1; show = 0; lastS = s; rockets.length = 0; fx.clear(); bits.clear(); soot.clear(); stall.visible = true; wreck.visible = false; flash.intensity = 0; ring.visible = false; [...balls, ...lobes].forEach((o) => { o.visible = false; }); }

  // dt is film time: slow motion slows the bang too
  function frame(st, dt, now, events) {
    if (st) {
      if (lastS < B_S - 2 && st.s >= B_S - 2) for (let i = 0; i < 16; i++) { const c = cos(st.yaw), s = sin(st.yaw), k = 4 + random() * 5; fx.emit(st.x - c * 1.9, GROUND + 0.4, st.z - s * 1.9, -ax * k + (random() - 0.5) * 2, 1.5 + random() * 2, -az * k + (random() - 0.5) * 2, 0.7, 0.7, '#ffd27a', 5); } // a backfire: sparks skip across to the stall
      if (lastS < B_S + 3 && st.s >= B_S + 3) { age = 0; fuse = 0.05; left = 15; stall.visible = false; wreck.visible = true; bits.burst(E.x, E.z, ax, az); events?.boom?.(); for (let i = 0; i < 70; i++) { const a = random() * 2 * PI, v = 4 + random() * 9; fx.emit(E.x, GROUND + 1.2, E.z, cos(a) * v, 2 + random() * 9, sin(a) * v, 0.6 + random() * 0.8, 0.9, i % 3 ? '#ffd27a' : '#ffffff', 9); } }
      lastS = st.s;
      for (const w of workers) { // they watch the car come, then throw their arms up as it goes over their heads
        const over = ramp(st.s, H.s1 - 3, H.s1 + 2) * (1 - ramp(st.s, H.land + 14, H.land + 30)), a = atan2(st.z - w.o.z, st.x - w.o.x), turn = atan2(sin(a - w.face), cos(a - w.face));
        w.p.head.rotation.y = -clamp(turn, -1.4, 1.4); w.p.head.rotation.z = over * 0.5; w.p.armR.rotation.z = 1.15 + over * 1.7 + sin(now * 9) * 0.08 * over; w.p.armL.rotation.z = over * 2.85;
      }
      if (workers.digger) workers.digger.userData.arm.rotation.z = sin(now * 0.9) * 0.1;
    }
    if (age >= 0) {
      age += dt; const k = 1 - (1 - Math.min(1, age / 0.45)) ** 3, fade = 1 - ramp(age, 0.2, 1.0);
      balls.forEach((o) => { o.visible = fade > 0; o.scale.setScalar(0.4 + 2.6 * o.userData.r * k); o.material.opacity = fade; o.position.y = GROUND + 1.3 + age * 1.6; });
      ring.visible = age < .45; ring.scale.setScalar(1+age*13); ring.material.opacity=.19*(1-age/.45);
      flash.intensity = 900 * exp(-age * 5);
      const cool = ramp(age, 0.2, 0.9), gone = 1 - ramp(age, 1.8, 3.6);
      lobes.forEach((o,i) => {
        const u=o.userData, d=.5+2.1*k+age*.42;
        o.visible=gone>0; o.position.set(E.x+u.dx*d,GROUND+1.3+u.dy*d+age*u.up,E.z+u.dz*d);
        const scale=u.r*(.45+k)*(2.45+age*.8);
        o.scale.set(scale,scale*(.91+i%3*.09),1);
        o.material.color.copy(hot).lerp(sootColor,Math.min(1,cool*(1.04+.04*(i%3))));
        o.material.opacity=gone*(.85-.22*cool); o.material.rotation=i*1.46+age*(i%2?.22:-.18);
      });
      for (const [t, c] of [[0.3, 1], [0.55, 2], [0.85, 0], [1.2, 3]]) if (age - dt < t && age >= t) { // the crates of fireworks go off one after another
        const x = E.x + (random() - 0.5) * 3 + ax * 1.5, y = GROUND + 2 + random() * 2.5, z = E.z + (random() - 0.5) * 3 + az * 1.5; events?.pop?.();
        for (let j = 0; j < 45; j++) { const a = random() * 2 * PI, u = random() * 2 - 1, q = sqrt(1 - u * u), v = 4.5 + random() * 3; fx.emit(x, y, z, cos(a) * q * v, u * v, sin(a) * q * v, 0.8 + random() * 0.6, 2.2, j % 6 ? COLS[c] : '#ffffff', 4.5); }
      }
      flames.forEach((f, i) => { const h = (0.65 + 0.35 * sin(now * (9 + i * 2.3) + i)) * (1 - ramp(age, 5, 11)); f.visible = h > 0.03; f.scale.set(1, h, 1); f.position.set(f.userData.at[0], f.userData.at[1] + 0.45 * h, f.userData.at[2]); });
      if (age < 4.5 && random() < dt * 34) soot.emit(E.x + (random() - 0.5), GROUND + 0.6, E.z + (random() - 0.5), 1.6 + random(), ax * 0.6, az * 0.6);
      fuse -= dt; while (fuse <= 0 && left > 0) { left--; fuse += 0.1 + random() * 0.28; launch(E.x, GROUND + 1, E.z, ax * 2.2 + (random() - 0.5) * 3, az * 2.2 + (random() - 0.5) * 3, COLS[left % COLS.length]); events?.rocket?.(); }
    }
    if (show > 0 && showAt) { // the finale: rockets from behind the rooftops
      fuse -= dt; while (fuse <= 0 && show > 0) { show--; fuse += 0.25 + random() * 0.4; const a = showAt.a + (random() - 0.5) * 2.4, d = 16 + random() * 14; launch(showAt.x + cos(a) * d, GROUND + 9, showAt.z + sin(a) * d, (random() - 0.5) * 3, (random() - 0.5) * 3, COLS[show % COLS.length]); if (show % 3 === 0) events?.rocket?.(); }
    }
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i]; r.fuse -= dt; r.vy -= 5 * dt; r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
      fx.emit(r.x, r.y, r.z, (random() - 0.5) * 1.5, -2, (random() - 0.5) * 1.5, 0.4, 0.75, '#ffd9a0', 2);
      if (r.fuse > 0) continue;
      rockets.splice(i, 1); events?.pop?.();
      // A golden inner ring or a drooping willow inside the coloured shell.
      // Use the launch position for variation so the soundtrack retains its original random sequence.
      const tilt = r.x*.013+r.z*.031, willow = Math.sin(tilt) > 0;
      for (let j=0;j<28;j++) {
        const a=j*2*PI/28, v=willow?4.5:6.8;
        fx.emit(r.x,r.y,r.z,cos(a)*v,willow?2.5+sin(j*1.72):sin(a)*v*.78,sin(a)*v*(willow?1:.62),
          willow?1.75:1.12,willow?1.35:1.7,j%4?'#ffd389':'#fff5d4',willow?5:2.4);
      }
      for (let j = 0; j < 60; j++) { const a = random() * 2 * PI, u = random() * 2 - 1, q = sqrt(1 - u * u), v = 6.5 + random() * 3; fx.emit(r.x, r.y, r.z, cos(a) * q * v, u * v, sin(a) * q * v, 1.1 + random() * 0.8, 2.6, j % 7 ? r.col : '#ffffff', 4.5); }
    }
    fx.update(dt); bits.update(dt); soot.update(dt);
  }
  return { frame, reset, fireworks(x, z, a, n = 18) { showAt = { x, z, a }; show = n; fuse = 0; } }; // a: the side of (x, z) the rockets go up on, so they are in the picture
}
