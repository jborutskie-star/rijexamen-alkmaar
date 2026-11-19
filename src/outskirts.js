// The open ground between the city-centre model and the polder follows Alkmaar's
// streets, watercourses, gardens and building footprints (OpenStreetMap contributors).
import * as THREE from 'three';
import { staticTiles } from './static-tiles.js';
import rows from '../data/alkmaar-rooflines.json' with { type: 'json' };

export function addOutskirts(scene, cut, facades) {
  const extent = 1440, step = 240, ground = [];
  for (let x = -extent; x < extent; x += step) for (let z = -extent; z < extent; z += step) {
    if (x >= -480 && x < 480 && z >= -240 && z < 240) continue;
    const p = new THREE.PlaneGeometry(step, step).rotateX(-Math.PI / 2).translate(x + step / 2, .05, z + step / 2);
    const pos = p.attributes.position, uv = p.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, .5 + pos.getX(i) / (2 * extent), .5 - pos.getZ(i) / (2 * extent));
    ground.push(p);
  }
  // This is an illustrated albedo atlas drawn from map vectors. It is printed
  // over the paved base and field base, beneath all the original street paint.
  const atlas = new THREE.TextureLoader().load(new URL('../assets/alkmaar-outskirts.webp', import.meta.url).href);
  atlas.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshLambertMaterial({ map: atlas, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, ...cut });
  const edge = staticTiles(ground, material, facades);
  edge.renderOrder = -19.5;
  scene.add(edge);

  // One low pitched silhouette per terrace. The metre coordinates, rotation,
  // footprint and grouping all come from the same mapped roofs as the albedo.
  // One atlas with a pitched pantile roof and a two-storey brick bay; both repeat
  // along the terrace. The bays include window lintels, doorways and the gutter.
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const fill = (color,x,y,w,h) => { ctx.fillStyle=color; ctx.fillRect(x,y,w,h); };
  fill('#eee1c6',0,64,128,64);
  for (let y=64;y<128;y+=4) for (let x=-8;x<128;x+=16) {
    fill((x+y)%3?'#d4bd9f':'#e1ccb1',x+(y%8?0:8),y+1,15,2);
  }
  fill('#ad8d70',0,67,128,2); fill('#b9a18c',0,96,128,2);
  for (const y of [72,104]) for (const x of [8,36,73,101]) {
    fill('#fae7cc',x-2,y-2,20,20); fill('#53626a',x,y,16,15);
    fill('#8b9b98',x+2,y+1,5,7); fill('#e3d7bb',x+7,y,2,16); fill('#d5c7ad',x,y+7,16,1);
  }
  fill('#676653',54,104,13,24); fill('#d2af8e',53,102,15,2);
  fill('#eee0ca',0,0,128,64);
  for (let y=0;y<64;y+=6) for (let x=-4;x<128;x+=7) {
    fill('#ccab8b',x+(y%12?0:3),y,1.5,5.2); fill('#dac6ae',x+(y%12?0:3),y+5,7,1);
  }
  fill('#b49c89',0,61,128,3); fill('#9c8e7a',0,64,128,2);
  // Occasional slate roof windows sit flush with the roof pitch.
  for (const x of [24,91]) { fill('#8e8475',x-2,22,13,15);fill('#68818a',x,24,9,10);fill('#bdc6c1',x+1,24,7,2); }
  const facade = new THREE.CanvasTexture(canvas);
  facade.colorSpace = THREE.SRGBColorSpace; facade.wrapS=THREE.RepeatWrapping;
  const tiles = new Map(), palette = ['#9e523a','#b26846','#a95037','#b9754c','#6a5650','#7c7164','#954e35','#a85b3c'];
  const tint = new THREE.Color();
  for (const [x,z,length,width,angle,eaves,swatch] of rows) {
    const key = Math.floor(x / 160) + ',' + Math.floor(z / 160);
    if (!tiles.has(key)) tiles.set(key, { position: [], color: [], uv: [] });
    const tile = tiles.get(key), a = length / 20, b = width / 20;
    const u = Math.cos(angle / 1000), v = Math.sin(angle / 1000), h = eaves / 10;
    const point = (s,t,y) => [x + s*u - t*v, y, z + s*v + t*u];
    const verts = [];
    for (const y of [.05,h]) for (const [s,t] of [[-a,-b],[-a,b],[a,b],[a,-b]]) verts.push(point(s,t,y));
    verts.push(point(-a,0,h+Math.min(3.3,b*.48)), point(a,0,h+Math.min(3.3,b*.48)));
    const bays = Math.max(1, Math.round(length/56));
    const across = Math.max(1, Math.round(width/62));
    const brick = ['#cbaf98','#bd856c','#c49f83','#cda78b'][swatch%4];
    const face = (ids, uv, color) => {
      tint.set(color);
      const indices = ids.length===4 ? [0,1,2,0,2,3] : [0,1,2];
      for (const i of indices) {
        tile.position.push(...verts[ids[i]]); tile.color.push(tint.r,tint.g,tint.b); tile.uv.push(...uv[i]);
      }
    };
    const wall = n => [[0,.008],[n,.008],[n,.485],[0,.485]];
    face([0,1,5,4],wall(across),brick); face([1,2,6,5],wall(bays),brick);
    face([2,3,7,6],wall(across),brick); face([3,0,4,7],wall(bays),brick);
    const end = [[0,.25],[across,.25],[across/2,.48]];
    face([4,5,8],end,brick);face([6,7,9],end,brick);
    const roof = [[0,.514],[bays,.514],[bays,.99],[0,.99]];
    face([5,6,9,8],roof,palette[swatch]);
    face([7,4,8,9],roof,palette[swatch]);
  }
  const rooftops = Array.from(tiles.values(), tile => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tile.position,3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(tile.color,3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(tile.uv,2));
    g.computeVertexNormals();
    return g;
  });
  scene.add(staticTiles(rooftops,new THREE.MeshLambertMaterial({vertexColors:true,map:facade}),facades));
}
