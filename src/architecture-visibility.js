// Use the opaque walls which were actually built. A cell is closed only when its
// four corners sit inside one wall. Gaps, rooflines and the ends of streets stay open.
import * as THREE from 'three';

const columns = 48, rows = 32, sector = 48;
const key = (x,z) => 8192*x+z;

export function facadeVisibility() {
  const streets = new Map(), depth = new Float32Array(columns*rows);
  const screen = new THREE.Matrix4(), px = new Float64Array(5), py = new Float64Array(5);
  const vx = new Float64Array(5), vy = new Float64Array(5), edge = new Float64Array(5);
  const cx=new Float64Array(4),cy=new Float64Array(4),cw=new Float64Array(4);
  let camera, active = false;

  function wall(ax,az,bx,bz,nx,nz,top) {
    const length = Math.hypot(bx-ax,bz-az);
    if (length < 3 || top < 3) return;
    const x=(ax+bx)*.5, z=(az+bz)*.5;
    const id=key(Math.floor(x/sector),Math.floor(z/sector));
    if (!streets.has(id)) streets.set(id,[]);
    // Stay behind recessed glazing and inside the sills, ends and roof of the shell.
    const ex=(bx-ax)*.35/length, ez=(bz-az)*.35/length;
    streets.get(id).push({ax:ax+ex-nx*.3,az:az+ez-nz*.3,bx:bx-ex-nx*.3,bz:bz-ez-nz*.3,
      nx,nz,top:top-.35});
  }

  function raster(q) {
    const m=screen.elements;
    let far=0, minX=columns, maxX=0, minY=rows, maxY=0, n=0;
    const near=camera.near+.1;
    for(let i=0;i<4;i++) {
      const x=i<2?q.ax:q.bx,z=i<2?q.az:q.bz,y=i===1||i===2?q.top:.20;
      cx[i]=m[0]*x+m[4]*y+m[8]*z+m[12];
      cy[i]=m[1]*x+m[5]*y+m[9]*z+m[13];
      cw[i]=m[3]*x+m[7]*y+m[11]*z+m[15];
    }
    // A near-plane crossing is common for the nearest shop fronts. Clip the
    // opaque quadrilateral before projection so those facades still close cells.
    for(let i=0,j=3;i<4;j=i++) {
      if((cw[i]>=near)!==(cw[j]>=near)) {
        const t=(near-cw[j])/(cw[i]-cw[j]);
        px[n]=columns*.5*(1+(cx[j]+(cx[i]-cx[j])*t)/near);
        py[n++]=rows*.5*(1+(cy[j]+(cy[i]-cy[j])*t)/near);
        far=Math.max(far,near);
      }
      if(cw[i]>=near) {
        px[n]=columns*.5*(1+cx[i]/cw[i]);py[n++]=rows*.5*(1+cy[i]/cw[i]);far=Math.max(far,cw[i]);
      }
    }
    if(n<3)return;
    for(let i=0;i<n;i++){
      minX=Math.min(minX,px[i]);maxX=Math.max(maxX,px[i]);
      minY=Math.min(minY,py[i]);maxY=Math.max(maxY,py[i]);
    }
    const left=Math.max(0,Math.ceil(minX)), right=Math.min(columns,Math.floor(maxX));
    const bottom=Math.max(0,Math.ceil(minY)), top=Math.min(rows,Math.floor(maxY));
    if (left>=right || bottom>=top) return;
    const winding=Math.sign((px[1]-px[0])*(py[2]-py[0])-(py[1]-py[0])*(px[2]-px[0]));
    for (let i=0;i<n;i++) {
      const next=(i+1)%n;
      vx[i]=(py[i]-py[next])*winding; vy[i]=(px[next]-px[i])*winding;
      // Minimum signed edge distance over the entire cell, offset from its lower left corner.
      edge[i]=-vx[i]*px[i]-vy[i]*py[i]+Math.min(0,vx[i])+Math.min(0,vy[i]);
    }
    for (let y=bottom;y<top;y++) for (let x=left;x<right;x++) {
      const index=y*columns+x;
      if (depth[index]<=far) continue;
      let inside=true;
      for (let i=0;i<n;i++) if (vx[i]*x+vy[i]*y+edge[i]<=0) {inside=false;break;}
      if (inside) {depth[index]=far;active=true;}
    }
  }

  function update(view) {
    camera=view; active=false;
    const eye=view.position, x=Math.floor(eye.x/sector), z=Math.floor(eye.z/sector);
    if (eye.y>65) return;
    depth.fill(Infinity);
    screen.multiplyMatrices(view.projectionMatrix,view.matrixWorldInverse);
    for (let i=x-2;i<=x+2;i++) for (let j=z-2;j<=z+2;j++) {
      const walls=streets.get(key(i,j));
      if (walls) for (const q of walls) if ((eye.x-q.ax)*q.nx+(eye.z-q.az)*q.nz>0) raster(q);
    }
  }

  function hidden(sphere) {
    if (!active) return false;
    const {x,y,z}=sphere.center,r=sphere.radius, m=camera.matrixWorldInverse.elements;
    const d=-(m[2]*x+m[6]*y+m[10]*z+m[14]), near=d-r, far=d+r;
    if (near<=camera.near) return false;
    const u=m[0]*x+m[4]*y+m[8]*z+m[12],v=m[1]*x+m[5]*y+m[9]*z+m[13];
    const a=u-r,b=u+r,c=v-r,e=v+r, lens=camera.projectionMatrix.elements;
    const left=Math.max(0,Math.floor(columns*.5*(1+lens[0]*a/(a<0?near:far))));
    const right=Math.min(columns-1,Math.floor(columns*.5*(1+lens[0]*b/(b>0?near:far))));
    const bottom=Math.max(0,Math.floor(rows*.5*(1+lens[5]*c/(c<0?near:far))));
    const top=Math.min(rows-1,Math.floor(rows*.5*(1+lens[5]*e/(e>0?near:far))));
    if (left>right||bottom>top) return false;
    for (let yy=bottom;yy<=top;yy++) for (let xx=left;xx<=right;xx++) {
      if (depth[yy*columns+xx]+.2>=near) return false;
    }
    return true;
  }

  return {wall,update,hidden};
}
