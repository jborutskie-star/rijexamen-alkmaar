// Fixed furnishings can extend kilometres past the shot. Keep geometry required by either
// the film camera or the shadow camera, with the same instance order in both passes.
import * as THREE from 'three';

const allPlanes = 0b111111;
const outside = -1;

// A plane which already contains the parent sphere also contains every child.
// Zero means completely inside, and -1 means completely outside.
function clipSphere(sphere, frustum, mask) {
  if (mask <= 0) return mask;
  const { center, radius } = sphere;
  for (let bit = 1, i = 0; i < 6; ++i, bit <<= 1) {
    if (!(mask & bit)) continue;
    const distance = frustum.planes[i].distanceToPoint(center);
    if (distance < -radius) return outside;
    if (distance >= radius) mask &= ~bit;
  }
  return mask;
}

function dirtyRows(attribute, first, last) {
  const start = first * attribute.itemSize;
  const end = (last + 1) * attribute.itemSize;
  const previous = attribute.updateRanges[0];
  if (previous) {
    const low = Math.min(start, previous.start);
    previous.count = Math.max(end, previous.start + previous.count) - low;
    previous.start = low;
  } else {
    attribute.addUpdateRange(start, end - start);
  }
  attribute.needsUpdate = true;
}

export function cullInstances(scene, sun, watchersInView) {
  const batches = [], eye = new THREE.Frustum(), projection = new THREE.Matrix4();
  scene.updateMatrixWorld(true);
  scene.traverse((mesh) => {
    if (!mesh.userData.fixedInstances || mesh.count < 8) return;
    const source = mesh.instanceMatrix.array.slice(), colors = mesh.instanceColor?.array.slice();
    mesh.geometry.computeBoundingSphere();
    mesh.computeBoundingSphere();
    const envelope = mesh.boundingSphere.clone().applyMatrix4(mesh.matrixWorld);
    const sphere = mesh.geometry.boundingSphere, matrix = new THREE.Matrix4();
    const bounds = [], cells = new Map();
    for (let i = 0; i < mesh.count; i++) {
      matrix.fromArray(source, i * 16).premultiply(mesh.matrixWorld);
      const s = sphere.clone().applyMatrix4(matrix); bounds.push(s);
      const key = Math.floor(s.center.x / 64) + ',' + Math.floor(s.center.z / 64);
      if (!cells.has(key)) cells.set(key, { sphere: s.clone(), items: [] });
      const cell = cells.get(key); cell.sphere.union(s); cell.items.push(i);
    }
    batches.push({ mesh, source, colors, envelope, bounds, cells: [...cells.values()],
      visibleIds: new Int32Array(mesh.count).fill(-1) });
  });
  const shadow = sun.shadow.getFrustum();
  const visible = (s, casts) => eye.intersectsSphere(s) ||
    (casts && sun.castShadow && shadow.intersectsSphere(s));

  scene.onBeforeRender = (renderer, scene, camera) => {
    eye.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      camera.coordinateSystem, camera.reversedDepth);
    if (sun.castShadow) sun.shadow.updateMatrices(sun);
    for (const { mesh, source, colors, envelope, bounds, cells, visibleIds } of batches) {
      let count = 0, first = -1, last = -1;
      const cameraMask = clipSphere(envelope, eye, allPlanes);
      const shadowMask = sun.castShadow && mesh.castShadow ? clipSphere(envelope, shadow, allPlanes) : outside;
      if (cameraMask !== outside || shadowMask !== outside) {
        for (const cell of cells) {
          const cellEye = clipSphere(cell.sphere, eye, cameraMask);
          const cellShadow = clipSphere(cell.sphere, shadow, shadowMask);
          if (cellEye === outside && cellShadow === outside) continue;
          const inside = cellEye === 0 || cellShadow === 0;
          for (const id of cell.items) {
            if (!inside && clipSphere(bounds[id], eye, cellEye) === outside &&
                clipSphere(bounds[id], shadow, cellShadow) === outside) continue;
            if (visibleIds[count] !== id) {
              visibleIds[count] = id;
              if (first === -1) first = count;
              last = count;
              mesh.instanceMatrix.array.set(source.subarray(id * 16, id * 16 + 16), count * 16);
              if (colors) mesh.instanceColor.array.set(colors.subarray(id * 3, id * 3 + 3), count * 3);
            }
            count++;
          }
        }
      }
      mesh.count = count;
      mesh.visible = count > 0;
      if (first !== -1) {
        dirtyRows(mesh.instanceMatrix, first, last);
        if (colors) dirtyRows(mesh.instanceColor, first, last);
      }
    }
    watchersInView(visible);
  };
}
