// Only occluders on a ray from the film's viewing frustum toward the sun can
// affect the picture. Keep the full frustum, including the distant landscape.
import { Vector3, Plane } from 'three';

const faces = [[0,1,3],[4,6,7],[0,2,6],[1,5,7],[0,4,5],[2,3,7]];
const edges = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];

export function shadowReceivers() {
  const corners = Array.from({length:8}, () => new Vector3());
  const planes = Array.from({length:18}, () => new Plane());
  const light = new Vector3(), edge = new Vector3(), centre = new Vector3(), extreme = new Vector3();
  let count = 0;

  function update(camera, sun) {
    centre.set(0,0,0);
    for (let i=0;i<8;i++) {
      corners[i].set(i&1?1:-1,i&2?1:-1,i&4?1:-1).unproject(camera);
      centre.add(corners[i]);
    }
    centre.multiplyScalar(.125);
    light.setFromMatrixColumn(sun.shadow.camera.matrixWorld,2).normalize();
    count=0;
    for (const [a,b,c] of faces) {
      const p=planes[count].setFromCoplanarPoints(corners[a],corners[b],corners[c]);
      if (p.distanceToPoint(centre)<0) p.negate();
      if (p.normal.dot(light)>=0) count++;
    }
    // The side planes of the swept volume contain a silhouette edge and
    // the sun direction. When an edge is ambiguous, leave that plane out.
    for (const [a,b] of edges) {
      edge.subVectors(corners[b],corners[a]).cross(light);
      if(edge.lengthSq()<1e-12) continue;
      const p=planes[count].setFromNormalAndCoplanarPoint(edge.normalize(),corners[a]);
      if(p.distanceToPoint(centre)<0) p.negate();
      let supports=true;
      for(const c of corners) if(p.distanceToPoint(c)<-1e-5) {supports=false;break;}
      if(supports) count++;
    }
    // Expand by two metres for the shadow filter taps, receiver normal offset,
    // transformed bounding-sphere roundoff and the 2,048-texel map.
    for(let i=0;i<count;i++) planes[i].constant+=2;
  }

  function sphere(s) {
    for(let i=0;i<count;i++) if(planes[i].distanceToPoint(s.center)<-s.radius) return false;
    return true;
  }

  function box(b) {
    for(let i=0;i<count;i++) {
      const p=planes[i], n=p.normal;
      extreme.set(n.x>=0?b.max.x:b.min.x,n.y>=0?b.max.y:b.min.y,n.z>=0?b.max.z:b.min.z);
      if(p.distanceToPoint(extreme)<0) return false;
    }
    return true;
  }

  return {update,sphere,box};
}
