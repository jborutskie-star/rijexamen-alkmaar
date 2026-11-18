// The original street layout places these models. All parts of each prop share its instanced draw.
import * as THREE from 'three';
import { fuse } from './world.js';

const box = (w,h,d,col,x,y,z,tilt=0) => [new THREE.BoxGeometry(w,h,d),col,x,y,z,tilt];
const cylinder = (top,bottom,h,n,col,x,y,z) => [new THREE.CylinderGeometry(top,bottom,h,n),col,x,y,z];
const green = '#273b34', iron = '#39443c', brass = '#977b4d';

// Joined rings form a continuous turned profile. Each band gets its own finish.
function turning(profile, sides, x=0, z=0) {
  const parts = [];
  for (let i=1;i<profile.length;i++) {
    const [r0,y0] = profile[i-1], [r1,y1,col] = profile[i];
    const g = new THREE.LatheGeometry([new THREE.Vector2(r0,y0),new THREE.Vector2(r1,y1)],sides);
    parts.push([g,col,x,0,z]);
  }
  return parts;
}

export function streetLamp() {
  const parts = turning([[0,0],[.16,0,green],[.155,.09,green],[.126,.15,iron],[.118,.43,green],[.14,.47,iron],[.09,.53,green],[.062,3.79,green],[.11,3.82,brass],[.09,3.89,green],[.164,3.97,iron]],10);
  parts.push(box(.32,.42,.32,'#fae6a7',0,4.18,0));
  for (const x of [-.16,.16]) for (const z of [-.16,.16]) parts.push(box(.035,.46,.035,green,x,4.2,z));
  for (const y of [4.01,4.37]) {
    for (const s of [-1,1]) parts.push(box(.31,.035,.035,iron,0,y,s*.168),box(.035,.035,.31,iron,s*.168,y,0));
  }
  parts.push(...turning([[.18,4.41],[.31,4.43,green],[.29,4.48,iron],[.075,4.61,green],[.05,4.66,brass],[0,4.67,green]],6));
  return fuse(...parts);
}

export function bollard() {
  return fuse(...turning([[0,0],[.13,0,iron],[.13,.09,iron],[.115,.12,'#7a2925'],[.105,.50,'#963d33'],[.12,.54,'#682a28'],[.124,.57,'#dcc8a4'],[.124,.64,'#f6f1e4'],[.107,.67,'#8c322a'],[.105,.78,'#9b3b32'],[.125,.82,'#712c29'],[.118,.87,'#9f3c31'],[.08,.92,'#ad4d3b'],[0,.945,'#88352e']],10));
}

export function litterBin() {
  const parts = turning([[0,0],[.18,0,green],[.18,.05,iron],[.2,.05,green],[.21,.12,iron],[.23,.62,'#2f5d46'],[.26,.64,brass],[.26,.69,'#e5bb43'],[.24,.72,green],[.25,.85,green],[.27,.86,iron],[.27,.91,green],[.22,.93,iron],[.164,.93,'#445448'],[.144,.87,'#151e1b'],[0,.87,'#171e18']],12);
  for (let k=0;k<12;k++) {
    const a=k*Math.PI/6;
    parts.push([new THREE.BoxGeometry(.026,.44,.032).rotateY(a),'#466e51',Math.sin(a)*.216,.377,Math.cos(a)*.216]);
  }
  return fuse(...parts);
}

export function flowerPlanter() {
  const parts = [box(.99,.42,.99,'#704734',0,.27,0),box(1.17,.085,1.17,'#c48051',0,.50,0),box(1.04,.04,1.04,'#59442f',0,.542,0)];
  for (let k=0;k<5;k++) for (const s of [-1,1]) {
    const edge=(k-2)*.205, col=['#ab6841','#b9754b','#a96340'][k%3];
    parts.push(box(.194,.42,.045,col,edge,.25,s*.51),box(.045,.42,.194,col,s*.51,.25,edge));
  }
  for (const x of [-.47,.47]) for (const z of [-.47,.47]) parts.push(box(.105,.48,.105,'#966040',x,.24,z));
  const colors=['#ed6583','#f5b826','#f38ca6','#f9eed9','#e35f79'];
  for(let k=0;k<9;k++){
    const a=k*2.39996, d=k===0?0:.18+.19*((k%4)/3), x=Math.cos(a)*d,z=Math.sin(a)*d;
    const top=.99+.285*((k*7)%9)/8, stem=top-.56;
    parts.push(cylinder(.018,.023,stem,5,'#537540',x,.56+stem/2,z));
    const leaf=new THREE.SphereGeometry(1,6,4).scale(.055,.20,.035).rotateZ(.55).rotateY(a);
    parts.push([leaf,'#518744',x-.04*Math.cos(a),.83,z+.04*Math.sin(a)]);
    const bud = new THREE.LatheGeometry([new THREE.Vector2(0,0),new THREE.Vector2(.073,.035),new THREE.Vector2(.106,.121),new THREE.Vector2(.083,.162),new THREE.Vector2(.057,.106)],8);
    const p=bud.attributes.position;
    for(let i=0;i<p.count;i++) if(i%5===3 && (Math.floor(i/5)&1)) p.setY(i,p.getY(i)-.045);
    bud.computeVertexNormals(); parts.push([bud,colors[k%colors.length],x,top,z]);
  }
  return fuse(...parts);
}

export function cafeSet() {
  const parts=turning([[0,0],[.25,0,iron],[.26,.035,iron],[.08,.11,iron],[.052,.66,green],[.14,.71,iron],[.44,.715,'#8e7357'],[.46,.755,'#cfae79'],[.43,.765,'#e6d3ad'],[0,.765,'#e6d3ad']],14);
  parts.push(cylinder(.04,.04,1.54,8,'#ddd4bd',0,1.535,0));
  for(const s of [-1,1]){
    for(const x of [-.14,.14])for(const z of [-.14,.14])parts.push(box(.055,.39,.055,iron,s*.9+x,.195,z));
    for(let i=-1;i<=1;i++)parts.push(box(.4,.067,.121,i?'#665543':'#80664e',s*.9,.426,i*.132));
    parts.push(cylinder(.095,.10,.025,10,'#f7efdf',s*.24,.7775,.09));
    parts.push(...turning([[.046,.79],[.064,.86,'#f7f1da'],[.053,.865,'#eadfc7'],[.046,.845,'#76513b'],[0,.845,'#493528']],10,s*.24,.09));
  }
  return fuse(...parts);
}

export function parasol() {
  const positions=[], colors=[], tint=new THREE.Color();
  const tri=(a,b,c,color)=>{positions.push(...a,...b,...c);tint.set(color);for(let i=0;i<3;i++)colors.push(tint.r,tint.g,tint.b);};
  const spot=(r,y,a)=>[Math.sin(a)*r,y,Math.cos(a)*r];
  for(let k=0;k<8;k++){
    const a=k*Math.PI/4,b=a+Math.PI/4,m=(a+b)/2,shade=k%2?'#fcf4df':'#c2bdad';
    const top=[0,.30,0],left=spot(1.6,-.235,a),right=spot(1.6,-.235,b),mid=spot(1.6*Math.cos(Math.PI/8),-.19,m);
    tri(top,left,mid,shade);tri(top,mid,right,shade);
    const l=spot(1.6,-.26,a),r=spot(1.6,-.26,b),dip=spot(1.6*Math.cos(Math.PI/8),-.30,m);
    tri(left,l,dip,shade);tri(left,dip,mid,shade);tri(mid,dip,r,shade);tri(mid,r,right,shade);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}
