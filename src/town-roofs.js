// Fit a continuous ridge to narrow town-house footprints, including party walls
// with survey vertices or inset corners. The mesh never leaves the mapped lot.
import * as THREE from 'three';
import { inPoly } from './drive.js';

// The bridge corner and canal houses behind the exam have broad or indented
// street fronts. Choose their gable bearings from the street, using a point
// inside each surveyed lot so map ordering does not affect the roof.
export const canalFrontages = [
  { lot: [398,432], axis: [-8,15] }, { lot: [583,267], axis: [-5,8] },
  { lot: [509,416], axis: [8.1,4.4], tile: '#535d6c' },
  { lot: [507,426], axis: [-6.9,.9] },
];

export function ridgePlan(p, height, streetAxis) {
  let longest = 0, ux = 0, uz = 0, area = 0;
  for (let i = 0; i < p.length; i += 2) {
    const j = (i + 2) % p.length, dx = p[j] - p[i], dz = p[j + 1] - p[i + 1];
    const length = Math.hypot(dx, dz);
    if (length > longest) { longest = length; ux = dx / length; uz = dz / length; }
    area += p[i] * p[j + 1] - p[j] * p[i + 1];
  }
  if (!longest) return null;
  if (streetAxis) {
    const length=Math.hypot(...streetAxis);
    ux=streetAxis[0]/length;
    uz=streetAxis[1]/length;
  }
  const points = [];
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i], z = p[i + 1];
    points.push({ x, z, u: x * ux + z * uz, v: -x * uz + z * ux });
  }
  const v = points.map(q => q.v), u = points.map(q => q.u);
  const low = Math.min(...v), high = Math.max(...v), width = high - low;
  const length = Math.max(...u) - Math.min(...u);
  if (width < 3 || width > 12 || length < width * (streetAxis ? .52 : 1.1) || length > 35 ||
      Math.abs(area) < 1.48 * length * width) return null;
  // Two surveyed lots double back over a short edge. Their old roof is safer
  // than laying tiles over the overlap that this triangulator would produce.
  const contour = points.map(q => new THREE.Vector2(q.x, q.z));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const tiledArea = faces.reduce((sum, [i,j,k]) => {
    const a=points[i], b=points[j], c=points[k];
    return sum + Math.abs((b.x-a.x)*(c.z-a.z)-(c.x-a.x)*(b.z-a.z));
  },0);
  if (Math.abs(tiledArea - Math.abs(area)) > .00001) return null;
  return { points, faces, ux, uz, streetFront: !!streetAxis, middle: (low + high) / 2, half: width / 2,
    rise: Math.min(height * .27, width * .46, 4.6) };
}

export function buildRidge(plan, t, eave, tile, brick, tileSize, detail, tally, occupied) {
  const { points, middle, rise, half } = plan;
  const y = q => eave + Math.max(0, 1 - Math.abs(q.v - middle) / half) * rise;
  const vertex = q => [q.x, y(q), q.z];
  const uv = q => [q.u / tileSize, (half - Math.abs(q.v - middle)) * Math.hypot(1, rise / half) / tileSize];
  const ridge = (a, b) => {
    const f = (middle - a.v) / (b.v - a.v);
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, u: a.u + (b.u - a.u) * f, v: middle };
  };
  // Splitting each floor-plan triangle handles re-entrant corners and avoids
  // bridging across neighbouring courtyards.
  for (const indices of plan.faces) {
    for (const side of [-1, 1]) {
      const face = [];
      for (let i = 0; i < 3; i++) {
        const a = points[indices[i]], b = points[indices[(i + 1) % 3]];
        const da = (a.v - middle) * side, db = (b.v - middle) * side;
        if (da >= 0) face.push(a);
        if (da * db < 0) face.push(ridge(a, b));
      }
      for (let i = 1; i + 1 < face.length; i++) {
        const a = face[0], b = face[i], c = face[i + 1];
        t.roofs.tri(vertex(a), vertex(b), vertex(c), [0, 1, 0], tile, uv(a), uv(b), uv(c));
      }
    }
  }
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const split = (a.v - middle) * (b.v - middle) < 0 ? [a, ridge(a, b), b] : [a, b];
    const out = [a.z - b.z, 0, b.x - a.x];
    if (detail && !plan.streetFront && split.length === 3 && Math.min(Math.abs(a.v-middle),Math.abs(b.v-middle)) > half*.67 && Math.hypot(out[0],out[2]) > 3.5) {
      // A small attic light with a stone reveal. Its diameter follows the gable.
      const r = Math.min(.54, rise*.18), c = split[1], length = Math.hypot(out[0],out[2]);
      const nx = out[0]/length, nz = out[2]/length, cy=eave+rise*.42;
      const at=(radius,i,depth)=>[c.x+nz*Math.cos(i*Math.PI/4)*radius+nx*depth,cy+Math.sin(i*Math.PI/4)*radius,c.z-nx*Math.cos(i*Math.PI/4)*radius+nz*depth];
      for (let k=0;k<8;k++) {
        const j=(k+1)%8;
        t.trim.quad(at(r,k,.13),at(r,j,.13),at(r*.73,j,.065),at(r*.73,k,.065),out,new THREE.Color(k%2?'#d6c7af':'#eadfca'));
        t.trim.tri(at(0,0,.048),at(r*.73,k,.065),at(r*.73,j,.065),out,new THREE.Color(k<4?'#5e7880':'#425663'));
      }
    }
    if (plan.streetFront) {
      const length = Math.hypot(out[0], out[2]), nx = out[0]/length, nz = out[2]/length;
      const open = !occupied?.((a.x+b.x)/2+nx*.16,(a.z+b.z)/2+nz*.16);
      // At an inset frontage the ridge may meet the short return between two
      // bays. Seat each attic sash in the wall actually below the tiles.
      if (open && length>2.45 && Math.abs(b.v-a.v)>length*.74) {
        const centre=Math.min(.69,Math.max(.31,(middle-a.v)/(b.v-a.v)));
        const hw=Math.min(.53,length*.15), lo=centre-hw/length, hi=centre+hw/length;
        const room=f=>y({v:a.v+(b.v-a.v)*f})-eave;
        const head=Math.min(1.44,Math.min(room(lo),room(hi))-.24);
        if(head>.74) {
          const sill=Math.max(.13,head-1.14), pt=(f,h,d)=>[
            a.x+(b.x-a.x)*f+nx*d,eave+h,a.z+(b.z-a.z)*f+nz*d];
          const panel=(l,bot,r,top,d,c)=>t.trim.quad(pt(l,bot,d),pt(r,bot,d),pt(r,top,d),pt(l,top,d),out,new THREE.Color(c));
          panel(lo,sill,hi,head,.040,'#e1d1b5');
          panel(lo+.09/length,sill+.10,hi-.09/length,head-.10,.065,'#5f7981');
          panel(centre-.035/length,sill+.08,centre+.035/length,head-.08,.080,'#c8cabe');
          panel(lo+.07/length,sill+(head-sill)*.57,hi-.07/length,sill+(head-sill)*.57+.065,.082,'#d6ccba');
          panel(lo-.06/length,sill-.08,hi+.06/length,sill,.095,'#ab9e8c');
        }
      }
      if (open) for (let j=1;j<split.length;j++) {
        const q=split[j-1], r=split[j];
        const edge=(p,level,depth)=>[p.x+nx*depth,y(p)+level,p.z+nz*depth];
        t.trim.quad(edge(q,-.20,.045),edge(r,-.20,.045),edge(r,-.11,.075),edge(q,-.11,.075),out,new THREE.Color('#846f58'));
        t.trim.quad(edge(q,-.11,.075),edge(r,-.11,.075),edge(r,-.015,.075),edge(q,-.015,.075),out,new THREE.Color('#e6d6b7'));
        t.trim.quad(edge(q,-.015,.075),edge(r,-.015,.075),edge(r,0,0),edge(q,0,0),[nx,1,nz],tile);
      }
    }
    for (let j = 1; j < split.length; j++) {
      const c = split[j - 1], d = split[j], floorC = [c.x, eave, c.z], floorD = [d.x, eave, d.z];
      if (y(d) > eave + .001) t.trim.tri(floorC, floorD, vertex(d), out, brick);
      if (y(c) > eave + .001) t.trim.tri(floorC, vertex(d), vertex(c), out, brick);
    }
  }
  dressRidge(plan,t,eave,tile,detail,tally,occupied);
}

// Roof furniture on the new surveyed roofs. Each sill and side cheek is seated
// against the fitted plane, including on slopes shallower than 45 degrees.
function dressRidge(plan, t, eave, tile, seed, tally, occupied) {
  if (!seed) return;
  const {points,middle,half,rise,ux,uz}=plan, pitch=rise/half, low=Math.min(...points.map(q=>q.u)), high=Math.max(...points.map(q=>q.u));
  const footprint=points.flatMap(q=>[q.x,q.z]);
  const at=(u,v,y)=>[u*ux-v*uz,y,u*uz+v*ux];
  const slope=v=>eave+rise*(1-Math.abs(v-middle)/half);
  const room=(u,v,hw,hd)=>{
    for(const a of [-hw,0,hw]) for(const b of [-hd,0,hd]) {
      const [x,,z]=at(u+a,v+b,0);
      if(!inPoly(footprint,x,z) || occupied?.(x,z) || Math.abs(v+b-middle)>half-.13) return false;
    }
    return true;
  };
  const count=(name,before)=>tally?.(name,1,(t.trim.p.length+t.roofs.p.length-before)/9);
  const size=()=>t.trim.p.length+t.roofs.p.length;
  const colour=v=>new THREE.Color(v), iron=colour('#686b68'), frame=colour('#ddd0b3'), dark=colour('#455a63');
  const sky=colour('#6e939d'), shadow=colour('#4d5656');
  // A narrow curb and a mitred flashing surround two panes. The glass, border
  // and central bar partition their surface; none share overlapping faces.
  const skylight=(u,v)=>{
    const w=.72, d=.54/Math.hypot(1,pitch);
    if(Math.abs(v-middle)<=d+.12 || !room(u,v,w,d)) return;
    const before=size(), rect=[[-w,-d],[-w,d],[w,d],[w,-d]], bevel=rect.map(([a,b])=>[a*.82,b*.76]);
    const pt=([a,b],h)=>at(u+a,v+b,slope(v+b)+h);
    for(let k=0;k<4;k++) {
      const j=(k+1)%4, a=pt(rect[k],0), b=pt(rect[j],0);
      t.trim.quad(a,b,pt(rect[j],.05),pt(rect[k],.05),[a[2]-b[2],0,b[0]-a[0]],iron);
      t.trim.quad(pt(rect[k],.05),pt(rect[j],.05),pt(bevel[j],.125),pt(bevel[k],.125),[0,1,0],k%2?frame:iron);
    }
    for(const [a,b,c] of [[-w*.82,-.037,sky],[-.037,.037,frame],[.037,w*.82,dark]]) {
      t.trim.quad(pt([a,-d*.76],.125),pt([a,d*.76],.125),pt([b,d*.76],.125),pt([b,-d*.76],.125),[0,1,0],c);
    }
    count('fitted roof windows',before);
  };
  const dormer=(u,side)=>{
    const v=middle+side*half*.76, foot=slope(v), head=Math.min(.99,.42*rise);
    const peak=Math.min(.38,.17*rise), run=head/pitch, tail=(head+peak)/pitch, w=.82;
    if(tail>=half*.72 || !room(u,v-side*tail/2,w,tail/2)) return false;
    const before=size(), atFace=(x,y,inset=0)=>at(u+x,v-side*inset,foot+y), out=[-uz*side,0,ux*side];
    const panel=(x0,y0,x1,y1,inset,c)=>t.trim.quad(atFace(x0,y0,inset),atFace(x1,y0,inset),atFace(x1,y1,inset),atFace(x0,y1,inset),out,c);
    const lip=.105*w;
    for(const dir of [-1,1]) {
      t.trim.tri(atFace(dir*w,0),atFace(dir*w,head),atFace(dir*w,head,run),[ux*dir,0,uz*dir],iron);
      t.roofs.quad(atFace(dir*w,head),atFace(dir*w,head,run),atFace(0,head+peak,tail),atFace(0,head+peak),[ux*dir,1,uz*dir],tile,[[0,0],[run*.8,0],[tail*.8,.72],[0,.72]]);
      panel(dir*w,0,dir*(w-lip),head,0,frame);
    }
    t.trim.tri(atFace(-w,head),atFace(w,head),atFace(0,head+peak),out,iron);
    panel(-w+lip,0,w-lip,.13,0,frame); panel(-w+lip,head-.11,w-lip,head,0,frame);
    const sill=.13, lintel=head-.11;
    for(const x of [-w+lip,w-lip])t.trim.quad(atFace(x,sill),atFace(x,lintel),atFace(x,lintel,.10),atFace(x,sill,.10),[ux*-Math.sign(x),0,uz*-Math.sign(x)],shadow);
    for(const y of [sill,lintel])t.trim.quad(atFace(-w+lip,y),atFace(w-lip,y),atFace(w-lip,y,.10),atFace(-w+lip,y,.10),[0,y===sill?1:-1,0],iron);
    panel(-w+lip,sill,-.04,lintel,.10,sky); panel(-.04,sill,.04,lintel,.10,frame); panel(.04,sill,w-lip,lintel,.10,dark);
    count('fitted dormers',before);
    return true;
  };
  const side=(seed%2?1:-1), along=f=>low+(high-low)*f;
  // Vary both slopes independently. No furniture is transferred from an old
  // flat deck to a pitch; every proposed rectangle is checked on this roof.
  if(seed%5<2) {
    if(!dormer(along(.34+(seed%4)*.045),side)) skylight(along(.4),middle+side*half*.55);
  } else if(seed%5<4) skylight(along(.39+(seed%4)*.045),middle+side*half*.55);
  if(seed%8===2 && seed%3!==1 && high-low>9.2) skylight(along(.67),middle-side*half*.52);
  if(seed%3!==1) return;
  const u=along(.65),v=middle-side*half*.65;
  if(!room(u,v,.38,.23)) return;
  const before=size(), top=Math.min(eave+rise-.27,slope(v)+.95), corners=[[-.38,-.23],[-.38,.23],[.38,.23],[.38,-.23]], cap=colour('#c2aa89');
  for(let i=0;i<4;i++) {
    const [a,b]=corners[i],[c,d]=corners[(i+1)%4],p=at(u+a,v+b,slope(v+b)),q=at(u+c,v+d,slope(v+d)),out=[p[2]-q[2],0,q[0]-p[0]];
    t.trim.quad(p,q,at(u+c,v+d,top-.12),at(u+a,v+b,top-.12),out,colour('#926047'));
    t.trim.quad(at(u+a,v+b,top-.12),at(u+c,v+d,top-.12),at(u+c,v+d,top),at(u+a,v+b,top),out,cap);
  }
  t.trim.quad(...corners.map(([a,b])=>at(u+a,v+b,top)),[0,1,0],cap);
  const ring=(radius,y,k)=>at(u+Math.cos(k*Math.PI/3)*radius,v+Math.sin(k*Math.PI/3)*radius,y);
  for(let k=0;k<6;k++) {
    const r=k*Math.PI/3+Math.PI/6;
    t.trim.quad(ring(.14,top,k),ring(.14,top,k+1),ring(.13,top+.19,k+1),ring(.13,top+.19,k),[ux*Math.cos(r)-uz*Math.sin(r),0,uz*Math.cos(r)+ux*Math.sin(r)],colour('#a65f47'));
    t.trim.tri(ring(.13,top+.19,k),ring(.13,top+.19,k+1),at(u,v,top+.19),[0,1,0],dark);
  }
  count('fitted chimney stacks',before);
}

// Small mapped timber sheds. A narrow garden store sits lower than a walk-in
// workshop. Both retain their surveyed footprints and sit below the height cap.
export function boardedShed(p, t, h, seed) {
  const points = Array.from({length:4},(_,i)=>[p[2*i],p[2*i+1]]);
  const edge = i => Math.hypot(points[(i+1)%4][0]-points[i][0],points[(i+1)%4][1]-points[i][1]);
  const end = edge(0)<edge(1) ? 0 : 1;
  const q=Array.from({length:4},(_,i)=>points[(end+i)%4]);
  const width=edge(end), length=edge(1-end), narrow=width<1.65;
  const peak=narrow ? Math.min(h,1.62) : h, rise=Math.min(width*.54,peak*.38);
  const eave=peak-rise, roof=new THREE.Color(seed%2?'#976047':'#776052');
  const timber=new THREE.Color(narrow?'#75816e':'#617264'), trim=new THREE.Color('#d0c2a9');
  const glass=new THREE.Color('#83a4aa'), door=new THREE.Color('#59665b'), iron=new THREE.Color('#615c50');
  const base=new THREE.Color('#967963'), tone=k=>timber.clone().multiplyScalar(k);
  const at=(point,y)=>[point[0],y,point[1]];
  const mid=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const ridges=[mid(q[0],q[1]),mid(q[2],q[3])].map(v=>at(v,peak));
  for (const [a,b,r,s] of [[1,2,1,0],[3,0,0,1]]) {
    t.roofs.quad(at(q[a],eave),at(q[b],eave),ridges[r],ridges[s],[0,1,0],roof,
      [[0,0],[length*.75,0],[length*.75,rise],[0,rise]]);
  }
  for (let i=0;i<4;i++) {
    const a=q[i],b=q[(i+1)%4],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
    const nx=(a[1]-b[1])/len, nz=(b[0]-a[0])/len, normal=[nx,0,nz];
    const pt=(f,y,d=0)=>[a[0]+(b[0]-a[0])*f+nx*d,y,a[1]+(b[1]-a[1])*f+nz*d];
    const panel=(lo,bot,hi,top,d,c)=>t.trim.quad(pt(lo,bot,d),pt(hi,bot,d),pt(hi,top,d),pt(lo,top,d),normal,c);
    panel(0,0,1,.23,0,base);
    for (let j=0;j<8;j++) panel(0,.23+(eave-.23)*j/8,1,.23+(eave-.23)*(j+1)/8,0,tone([.95,1.10,1,.91][j%4]));
    if (i%2===0) {
      const ridge=ridges[i/2];
      t.trim.tri(pt(0,eave),pt(1,eave),ridge,normal,timber);
      for (const x of [0,1]) t.trim.quad(pt(x,eave-.09,.025),pt(.5,peak-.09,.025),pt(.5,peak,.025),pt(x,eave,.025),normal,trim);
    } else panel(0,eave-.105,1,eave,.025,trim);
    if(i%2===0) {
      if(width>2.45) {
        const hw=Math.min(.25,.69/len);
        panel(.5-hw,.65,.5+hw,eave-.20,.04,trim);
        panel(.5-hw+.07/len,.73,.5+hw-.07/len,eave-.28,.055,glass);
        panel(.5-.032/len,.72,.5+.032/len,eave-.26,.075,trim);
      }
      continue;
    }
    const doorCentre=.25,half=Math.min(.15,.5/len),head=Math.min(2.04,eave-.1);
    if (i===1 || narrow) {
      panel(doorCentre-half-.035/len,.08,doorCentre+half+.035/len,head,.035,trim);
      panel(doorCentre-half,.08,doorCentre+half,head-.08,.06,door);
      for(const y of [.2,head*.68]) panel(doorCentre-half,y,doorCentre+.06/len,y+.055,.075,iron);
    }
    const centre=(i===1 || narrow) ? .67 : .48, windowHalf=Math.min(.17,.68/len);
    panel(centre-windowHalf,eave*.48,centre+windowHalf,eave*.86,.035,trim);
    panel(centre-windowHalf+.06/len,eave*.48+.06,centre+windowHalf-.06/len,eave*.86-.06,.06,glass);
    panel(centre-.029/len,eave*.48,centre+.029/len,eave*.86,.08,trim);
  }
}
