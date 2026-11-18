// Fit a continuous ridge to narrow town-house footprints, including party walls
// with survey vertices or inset corners. The mesh never leaves the mapped lot.
import * as THREE from 'three';
import { inPoly } from './drive.js';

export function ridgePlan(p, height) {
  let longest = 0, ux = 0, uz = 0, area = 0;
  for (let i = 0; i < p.length; i += 2) {
    const j = (i + 2) % p.length, dx = p[j] - p[i], dz = p[j + 1] - p[i + 1];
    const length = Math.hypot(dx, dz);
    if (length > longest) { longest = length; ux = dx / length; uz = dz / length; }
    area += p[i] * p[j + 1] - p[j] * p[i + 1];
  }
  if (!longest) return null;
  const points = [];
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i], z = p[i + 1];
    points.push({ x, z, u: x * ux + z * uz, v: -x * uz + z * ux });
  }
  const v = points.map(q => q.v), u = points.map(q => q.u);
  const low = Math.min(...v), high = Math.max(...v), width = high - low;
  const length = Math.max(...u) - Math.min(...u);
  if (width < 3 || width > 12 || length < width * 1.1 || length > 35 ||
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
  return { points, faces, ux, uz, middle: (low + high) / 2, half: width / 2,
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
    if (detail && split.length === 3 && Math.min(Math.abs(a.v-middle),Math.abs(b.v-middle)) > half*.67 && Math.hypot(out[0],out[2]) > 3.5) {
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

// A shallow metal roof and painted boarding for the small mapped sheds.
// The existing wall rectangle is also the maximum extent of the new cladding.
export function boardedShed(p, t, h, seed) {
  const points = Array.from({length:4},(_,i)=>[p[2*i],p[2*i+1]]);
  const edge = (i) => {
    const a = points[i], b = points[(i+1)%4];
    return Math.hypot(b[0]-a[0], b[1]-a[1]);
  };
  const long = edge(0) > edge(1) ? 0 : 1, roof = new THREE.Color('#566063');
  const finish = ['#5d6c60','#626f6a','#5c6858'][seed%3];
  const trim = new THREE.Color('#c9c6b4'), door = new THREE.Color('#475a53'), iron = new THREE.Color('#484943');
  const top = i => i === long || i === (long+1)%4 ? h : h-.32;
  const at = (i,y) => [points[i][0],y,points[i][1]];
  t.trim.quad(at(0,top(0)),at(1,top(1)),at(2,top(2)),at(3,top(3)),[0,1,0],roof);
  for (let i=0;i<4;i++) {
    const j=(i+1)%4, a=points[i], b=points[j], len=edge(i), nx=(a[1]-b[1])/len, nz=(b[0]-a[0])/len, normal=[nx,0,nz];
    const pt=(f,y,depth=0)=>[a[0]+(b[0]-a[0])*f+nx*depth,y,a[1]+(b[1]-a[1])*f+nz*depth];
    const panel=(x0,y0,x1,y1,depth,col)=>t.trim.quad(pt(x0,y0,depth),pt(x1,y0,depth),pt(x1,y1,depth),pt(x0,y1,depth),normal,col);
    const count=11;
    for (let row=0;row<count;row++) {
      const f=row/count, g=(row+1)/count, colour=new THREE.Color(finish).multiplyScalar([1,.91,1.02,.96][row%4]);
      t.trim.quad(pt(0,top(i)*f),pt(1,top(j)*f),pt(1,top(j)*g),pt(0,top(i)*g),normal,colour);
    }
    t.trim.quad(pt(0,top(i)-.115,.03),pt(1,top(j)-.115,.03),pt(1,top(j),.03),pt(0,top(i),.03),normal,trim);
    if (len < 2.4) continue;
    const centre=.51, half=.49/len, left=centre-half, right=centre+half;
    panel(left-.09/len,.06,right+.09/len,2.10,.032,trim);
    panel(left,.06,right,2.00,.058,door);
    for (const y of [.44,1.52]) panel(left+.04/len,y,centre+.06/len,y+.08,.086,iron);
    panel(right-.13/len,.86,right-.055/len,1.01,.086,trim);
  }
}
