// Three culls a whole InstancedMesh by its outer sphere. A six-kilometre line of lamps
// needs a finer test. Compact only fixed transforms, retaining anything the sun needs for shadows.
import * as THREE from 'three';

export function cullInstances(scene, sun, watchersInView) {
  const batches = [], eye = new THREE.Frustum(), projection = new THREE.Matrix4();
  scene.updateMatrixWorld(true);
  scene.traverse((mesh) => {
    if (!mesh.userData.fixedInstances || mesh.count < 8) return;
    const source = mesh.instanceMatrix.array.slice(), colors = mesh.instanceColor?.array.slice();
    mesh.geometry.computeBoundingSphere();
    mesh.computeBoundingSphere(); // This bound must cover the original full population.
    const sphere = mesh.geometry.boundingSphere, matrix = new THREE.Matrix4();
    const bounds = [], cells = new Map();
    for (let i=0;i<mesh.count;i++) {
      matrix.fromArray(source,i*16).premultiply(mesh.matrixWorld);
      const s=sphere.clone().applyMatrix4(matrix); bounds.push(s);
      const key=Math.floor(s.center.x/64)+','+Math.floor(s.center.z/64);
      if (!cells.has(key)) cells.set(key,{sphere:s.clone(),items:[]});
      const cell=cells.get(key); cell.sphere.union(s); cell.items.push(i);
    }
    batches.push({mesh,source,colors,bounds,cells:[...cells.values()],
      visibleIds:new Int32Array(mesh.count).fill(-1)});
  });
  const visible = (s,casts) => eye.intersectsSphere(s) ||
    (casts && sun.castShadow && sun.shadow.getFrustum().intersectsSphere(s));

  scene.onBeforeRender = (renderer, scene, camera) => {
    eye.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),
      camera.coordinateSystem,camera.reversedDepth);
    if (sun.castShadow) sun.shadow.updateMatrices(sun);
    for (const {mesh,source,colors,bounds,cells,visibleIds} of batches) {
      let count=0, changed=false;
      for (const cell of cells) {
        if (!visible(cell.sphere,mesh.castShadow)) continue;
        for (const id of cell.items) {
          if (!visible(bounds[id],mesh.castShadow)) continue;
          if (visibleIds[count]!==id) {
            visibleIds[count]=id; changed=true;
            mesh.instanceMatrix.array.set(source.subarray(id*16,id*16+16),count*16);
            if (colors) mesh.instanceColor.array.set(colors.subarray(id*3,id*3+3),count*3);
          }
          count++;
        }
      }
      mesh.count=count; mesh.visible=count>0;
      if (changed) { mesh.instanceMatrix.needsUpdate=true; if (colors) mesh.instanceColor.needsUpdate=true; }
    }
    watchersInView(visible);
  };
}
