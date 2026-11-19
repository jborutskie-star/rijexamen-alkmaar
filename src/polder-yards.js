// The Boekelermeer aerial shows working yards on field headlands and larger,
// pale industrial roofs along the access road. Fit these to the film's parcels.
import * as THREE from 'three';
import { fuse, GROUND } from './world.js';
import { staticTiles } from './static-tiles.js';

const grade = GROUND + .19;
const box = (w,h,d) => new THREE.BoxGeometry(w,h,d);

function pitchedShed(parts,x,z,w,d,eave,rise,wall,roof) {
  parts.push([box(w,eave,d),wall,x,grade+eave/2,z]);
  const gable = new THREE.Shape();
  gable.moveTo(-w/2,0); gable.lineTo(w/2,0); gable.lineTo(0,rise); gable.closePath();
  parts.push([new THREE.ExtrudeGeometry(gable,{depth:d,bevelEnabled:false}),wall,x,grade+eave,z-d/2]);
  const run=w/2+.26, slope=Math.atan2(rise,w/2);
  for(const side of [-1,1]) {
    const sheet=box(run/Math.cos(slope),.16,d+.72).rotateZ(-side*slope);
    parts.push([sheet,roof,x+side*run/2,grade+eave+rise*.5+.045,z]);
  }
}

function farmBuildings(parts,x,z,variant) {
  const roof=['#69706d','#8f6455','#61716d'][variant%3];
  if(variant===1 || variant===5) {
    // Twin glazed spans with alternating roof panes and white ridge framing.
    for(const dx of [-11.5,-5.1]) {
      pitchedShed(parts,x+dx,z-2,6.3,31,3.1,1.15,'#a1b1a5','#a8bdb5');
      for(const side of [-1,1]) {
        for(let j=0;j<6;j+=2) {
          parts.push([box(3.25,.12,4.8).rotateZ(-side*.35),'#c1cec4',x+dx+side*1.58,grade+3.86,z-14.5+j*5]);
        }
      }
      parts.push([box(.22,.30,31.5),'#d3d2bf',x+dx,grade+4.3,z-2]);
    }
  } else {
    pitchedShed(parts,x-8,z-3,13,29,4.3,3.6,'#967965',roof);
    for(const dx of [-3.35,3.35]) parts.push([box(3.8,2.95,.17),'#5d685f',x-8+dx,grade+1.48,z+11.58]);
    const side=variant%2?1:-1, solar=variant===2;
    for(const dz of [-8,0,8]) parts.push([box(solar?4.65:1.65,.13,solar?7.7:5.8).rotateZ(-side*.506),
      solar?'#475e67':'#b4c2be',x-8+side*3.7,grade+4.3+3.6*(1-3.7/6.5)+.22,z-3+dz]);
  }
  pitchedShed(parts,x+10,z+12,7.1,10.8,3.7,3.0,'#c6ad90','#9e6248');
  parts.push([box(.75,2.3,1.0),'#8a6954',x+11.2,grade+6.25,z+14],
    [box(4.8,2.1,3.5),'#aaa28b',x+10,grade+1.05,z+4.9]);
  if(variant===0 || variant===4) {
    for(const dz of [-5,1.6]) {
      parts.push([new THREE.CylinderGeometry(2.2,2.2,6.15,9),'#adafa3',x+6,grade+3.08,z+dz],
        [new THREE.ConeGeometry(2.25,1.4,9),'#818b83',x+6,grade+6.85,z+dz]);
    }
  } else {
    pitchedShed(parts,x+10,z-11,9.1,13.2,3.1,1.55,'#886d58','#637268');
  }
}

function shelterTree(parts,x,z,height,colour) {
  parts.push([new THREE.CylinderGeometry(.25,.33,height*.56,5),'#75694f',x,grade+height*.28,z],
    [new THREE.IcosahedronGeometry(1,0).scale(height*.43,height*.45,height*.48),colour,x,grade+height*.66,z]);
}

function workshop(parts,x,z,w,d,variant) {
  const eave=6.5+variant*.54, roof=['#b6b9b5','#c7c7bc','#8e9b9c'][variant%3];
  parts.push([box(w,eave,d),'#7d8179',x,grade+eave/2,z],
    [box(w+.34,.35,d+.34),roof,x,grade+eave+.13,z]);
  for(const side of [-1,1]) {
    parts.push([box(.19,.27,d+.35),'#d1cfc0',x+side*w/2,grade+eave+.40,z],
      [box(w,.27,.19),'#c5c6bb',x,grade+eave+.40,z+side*d/2]);
  }
  // Bands of rooftop lights, a PV array, a low office and doors on the court.
  for(const dx of [-w*.26,w*.20]) for(const dz of [-d*.28,0,d*.28]) {
    const solar=variant%2===0 && dx<0;
    parts.push([box(solar?w*.32:1.9,.22,solar?d*.24:d*.19),solar?'#475b66':'#d5e1dc',
      x+dx,grade+eave+.53,z+dz]);
  }
  const ox=x+w*.21, oz=z+d/2+2.5;
  parts.push([box(w*.44,3.50,5.1),'#a38976',ox,grade+1.75,oz],
    [box(w*.44+.28,.25,5.42),'#a0a69f',ox,grade+3.61,oz],
    [box(w*.34,1.24,.15),'#7c9296',ox,grade+1.95,oz+2.58]);
  for(const dx of [-w*.33,-w*.09]) {
    parts.push([box(w*.16,3.45,.18),'#596664',x+dx,grade+1.78,z+d/2+.07],
      [box(w*.19,.30,1.35),'#8b9189',x+dx,grade+.21,z+d/2+.65]);
  }
}

export function polderYards(group,{cells,roadX,free,trees,farms,cows,sheep,facades}) {
  const sections=[], near=(x,z)=>cells.find(c=>x>=c.x0 && x<c.x1 && z>=c.z0 && z<c.z1);
  const parcel=near(roadX-16,1150);
  if(!parcel) return;
  const laneZ=parcel.z1-21.5, laneWidth=4.4;
  const pad=(parts,x,z,w,d,surface,lift=0)=>parts.push([box(w,.14,d),surface,x,grade+lift-.07,z]);
  const segment=(parts,x1,z1,x2,z2,w,surface,y=grade)=>{
    const dx=x2-x1,dz=z2-z1,length=Math.hypot(dx,dz);
    if(length>.02) parts.push([box(length,.16,w).rotateY(-Math.atan2(dz,dx)),surface,
      (x1+x2)/2,y-.08,(z1+z2)/2]);
  };
  // Keep the headland road inside each field. Small abutments span the water
  // between adjacent parcels, leaving the drainage channel underneath open.
  const start=-815, end=roadX-4;
  const row=cells.filter(c=>laneZ>c.z0 && laneZ<c.z1 && c.kind!=='road' &&
    c.x1>start && c.x0<end).sort((a,b)=>a.x0-b.x0);
  let last=start;
  for(const c of row) {
    const first=Math.max(start,c.x0), far=Math.min(end,c.x1), strip=[];
    if(first>last+.1) {
      segment(strip,last-.15,laneZ,first+.15,laneZ,laneWidth+.85,'#98998a',grade+.12);
      for(const side of [-1,1]) segment(strip,last-.2,laneZ+side*2.63,first+.2,laneZ+side*2.63,.29,'#a6a797',grade+.28);
    }
    segment(strip,first,laneZ,far,laneZ,laneWidth+.8,'#9e9987',grade-.035);
    segment(strip,first,laneZ,far,laneZ,laneWidth,'#767771');
    sections.push(fuse(...strip));
    last=far;
  }
  const occupied=[...trees.map(o=>[o.x,o.z,3.9]),...farms.map(o=>[o.x,o.z,16]),
    ...cows.map(o=>[o.x,o.z,2]),...sheep.map(o=>[o.x,o.z,1.5])];
  const yards=[
    [-817,1220,0],[-548,1195,1],[-344,1135,2],[-723,1378,3],[-545,1432,4],[-280,1358,5],
    [roadX-64,1084,6],[roadX+40,1116,7],[roadX-48,1171,8],[roadX-53,1383,9],[roadX+51,1466,10],
  ];
  for(const [x,z,id] of yards) {
    const factory=id>=6, c=near(x,z), w=factory?54:41,d=factory?64:48;
    if(!c || c.kind==='road' || !free(x,z,Math.max(w,d)/2) ||
       x-w/2<c.x0+2 || x+w/2>c.x1-2 || z-d/2<c.z0+2 || z+d/2>c.z1-2) continue;
    if(occupied.some(([px,pz,r])=>Math.abs(px-x)<w/2+r && Math.abs(pz-z)<d/2+r)) continue;
    const parts=[];
    pad(parts,x,z,w,d,factory?'#929587':'#83926b');
    if(factory) {
      const width=w*[.78,.65,.84,.74,.62][id-6], depth=d*[.64,.55,.62,.66,.57][id-6];
      pad(parts,x,z+d*.31,w*.91,d*.36,'#a39e91',.045);
      workshop(parts,x-2,z-5,width,depth,id-6);
      if(id===7 || id===10) {
        const ax=x+w*.36;
        for(const dz of [-14,-3]) {
          parts.push([new THREE.CylinderGeometry(3.0,3.0,4.5,12),'#a3aca5',ax,grade+2.25,z+dz],
            [new THREE.CylinderGeometry(2.75,3.02,.54,12),'#c2c6b7',ax,grade+4.73,z+dz]);
        }
      }
      // Vehicles and delivery vans sit beside their bays, clear of the access.
      for(let i=0;i<4;i++) {
        const px=x-w*.31+i*3.2,pz=z+d*.36;
        parts.push([box(1.75,1.12,3.9),['#afb8ae','#526a73','#a16d5b','#91978d'][i],px,grade+.60,pz],
          [box(1.5,.44,1.8),'#748185',px,grade+1.34,pz+.07]);
      }
      const direction=x<roadX?1:-1;
      const gate=z+d*.29, roadSide=roadX-direction*4, edge=x+direction*w/2;
      const gateZ=[gate,gate+7,gate-7].find(g=>trees.every(t=>Math.abs(t.x-(roadX-direction*8.5))>4 || Math.abs(t.z-g)>4));
      if(gateZ===undefined) continue;
      segment(parts,edge,gate,roadSide,gateZ,4.6,'#858780');
    } else {
      const approach=z<laneZ?1:-1;
      // The front courts meet their driveways. A grass perimeter and broken
      // shelterbelt, common around Dutch erven, soften the edge against crops.
      const site=[];
      pad(site,x-2,z-2,29.6,35,'#9b957e',.035);
      pad(site,x+3.5,z+15.5,4.4,17,'#a49b85',.065);
      pad(site,x+10.7,z+11,11.4,16.1,'#969b77',.045);
      farmBuildings(site,x,z,id);
      for(let i=0;i<8;i++) {
        const jitter=Math.sin(i*14.7+id*5.2),h=4.9+(jitter+1)*.66;
        shelterTree(site,x-w*.44+jitter*.7,z-d*.39+i*5.8,h,i%3?'#627b58':'#7c905e');
      }
      for(let i=0;i<(id%2?3:5);i++) {
        const h=4.4+Math.cos(i+id)*.52;
        shelterTree(site,x-w*.29+i*5.45,z-d*.43,h,'#718558');
      }
      if(approach<0) {
        for(const part of site) {
          part[0].rotateY(Math.PI); part[2]=2*x-part[2]; part[4]=2*z-part[4];
        }
      }
      parts.push(...site);
      const roadEnd=z+approach*d/2, gate=x+approach*3.5;
      const sign=Math.sign(laneZ-roadEnd), pathWidth=3.65;
      let cursor=roadEnd;
      const ordered=cells.filter(field=>gate>field.x0 && gate<field.x1 &&
        field.z1>Math.min(roadEnd,laneZ) && field.z0<Math.max(roadEnd,laneZ)).sort((a,b)=>sign*(a.z0-b.z0));
      for(const field of ordered) {
        const a=sign>0?Math.max(roadEnd,field.z0):Math.min(roadEnd,field.z1);
        const b=sign>0?Math.min(laneZ,field.z1):Math.max(laneZ,field.z0);
        if(Math.abs(a-cursor)>.1) {
          segment(parts,gate,cursor,gate,a,pathWidth+.5,'#99988a',grade+.13);
          for(const s of [-1,1]) segment(parts,gate+s*2.1,cursor,gate+s*2.1,a,.22,'#aba995',grade+.28);
        }
        segment(parts,gate,a,gate,b,pathWidth,'#a2967f');cursor=b;
      }
    }
    sections.push(fuse(...parts));
  }
  if(!sections.length) return;
  const mesh=staticTiles(sections,new THREE.MeshLambertMaterial({vertexColors:true}),facades);
  mesh.name='Boekelermeer farmyards and workshops';
  mesh.castShadow=mesh.receiveShadow=true;
  group.add(mesh);
}
