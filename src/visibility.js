// Street furnishings extend kilometres beyond each shot. Compact independent camera
// and sunlight instance buffers so hidden props can cast shadows without a color draw.
import * as THREE from 'three';
import { movingCanalInstances } from './canal-visibility.js';
import { shadowReceivers } from './shadow-receivers.js';
import { indexGeometry } from './index-geometry.js';

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

function makePass(mesh) {
  return {
    mesh, ids: new Int32Array(mesh.count), previous: new Int32Array(mesh.count).fill(-1),
  };
}

function updatePass(pass, count, source, colors) {
  const {mesh, ids, previous} = pass;
  mesh.count = count;
  mesh.visible = count > 0;
  let first = -1, last = -1;
  for (let i = 0; i < count; i++) {
    const id = ids[i];
    if (id === previous[i]) continue;
    previous[i] = id;
    if (first < 0) first = i;
    last = i;
    mesh.instanceMatrix.array.set(source.subarray(id * 16, id * 16 + 16), i * 16);
    if (colors) mesh.instanceColor.array.set(colors.subarray(id * 3, id * 3 + 3), i * 3);
  }
  if (first >= 0) {
    dirtyRows(mesh.instanceMatrix, first, last);
    if (colors) dirtyRows(mesh.instanceColor, first, last);
  }
}

export function cullInstances(scene, sun, watchersInView, facades, trafficInView) {
  const batches = [], eye = new THREE.Frustum(), cloudEye = new THREE.Frustum(), projection = new THREE.Matrix4();
  scene.updateMatrixWorld(true);
  const indexed=new Set();
  scene.traverse((mesh) => {
    if(mesh.isMesh && !mesh.isBatchedMesh && !indexed.has(mesh.geometry)) {
      indexGeometry(mesh.geometry);
      indexed.add(mesh.geometry);
    }
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
    const batch = { eyePass: makePass(mesh), source, colors, envelope, bounds, cells: [...cells.values()] };
    if (mesh.castShadow) {
      const caster = new THREE.InstancedMesh(mesh.geometry, mesh.material, mesh.count);
      caster.matrixAutoUpdate = false;
      caster.matrix.copy(mesh.matrix);
      caster.castShadow = true;
      const shadowFrustum = sun.shadow.getFrustum();
      caster.intersectsFrustum = frustum => frustum === shadowFrustum;
      mesh.castShadow = false;
      batch.shadowPass = makePass(caster);
    }
    batches.push(batch);
  });
  for (const { eyePass, shadowPass } of batches) {
    if (shadowPass) eyePass.mesh.parent.add(shadowPass.mesh);
  }
  const shadow = sun.shadow.getFrustum(), receivers=shadowReceivers();
  sun.shadow.camera.userData.receivers=receivers;
  const projected = new THREE.Sphere();
  scene.traverse(mesh => {
    if (!mesh.isMesh || !mesh.frustumCulled) return;
    const intersects = mesh.intersectsFrustum;
    mesh.intersectsFrustum = function(frustum) {
      if (!intersects.call(this,frustum)) return false;
      // A pass-specific instance batch can hold poses all over the city while
      // its geometry is only the local template. Its individual casters have
      // already been tested. Skins and batch tiles also own their own bounds.
      if(frustum===shadow && (this.isInstancedMesh || this.isSkinnedMesh || this.isBatchedMesh)) return true;
      const sphere=this.boundingSphere || this.geometry.boundingSphere;
      if(!sphere) return true;
      projected.copy(sphere).applyMatrix4(this.matrixWorld);
      return frustum===shadow ? receivers.sphere(projected) : !facades.hidden(projected);
    };
  });
  const canalInView = movingCanalInstances(scene,shadow);
  const visible = (s, casts) => (eye.intersectsSphere(s) && !facades.hidden(s)) ||
    (casts && sun.castShadow && shadow.intersectsSphere(s) && receivers.sphere(s));

  scene.onBeforeRender = (renderer, scene, camera) => {
    eye.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      camera.coordinateSystem, camera.reversedDepth);
    facades.update(camera);
    if (sun.castShadow) { sun.shadow.updateMatrices(sun); receivers.update(camera,sun); }
    for (const batch of batches) {
      const { eyePass, shadowPass, source, colors, envelope, bounds, cells } = batch;
      const mesh = eyePass.mesh;
      let eyeCount = 0, shadowCount = 0;
      // The wind translates the whole cloud layer. Test its original local spheres
      // against the current lens so far clouds can share two draws for the whole map.
      let view=eye;
      if (mesh.userData.driftingClouds) {
        view=cloudEye.copy(eye);
        for (const plane of view.planes) plane.constant+=plane.normal.x*mesh.parent.position.x;
      }
      const cameraMask = clipSphere(envelope, view, allPlanes);
      const shadowMask = sun.castShadow && shadowPass ? clipSphere(envelope, shadow, allPlanes) : outside;
      if (cameraMask !== outside || shadowMask !== outside) {
        for (const cell of cells) {
          let cellEye = clipSphere(cell.sphere, view, cameraMask);
          if (cellEye !== outside && view===eye && facades.hidden(cell.sphere)) cellEye = outside;
          const cellShadow = shadowMask!==outside && receivers.sphere(cell.sphere) ? clipSphere(cell.sphere,shadow,shadowMask) : outside;
          if (cellEye === outside && cellShadow === outside) continue;
          for (const id of cell.items) {
            const sphere = bounds[id];
            if (clipSphere(sphere, shadow, cellShadow) !== outside && receivers.sphere(sphere)) shadowPass.ids[shadowCount++] = id;
            if (clipSphere(sphere, view, cellEye) !== outside && (view !== eye || !facades.hidden(sphere))) {
              eyePass.ids[eyeCount++] = id;
            }
          }
        }
      }
      updatePass(eyePass, eyeCount, source, colors);
      if (shadowPass) updatePass(shadowPass, shadowCount, source, null);
    }
    canalInView(eye,sun.castShadow?shadow:null,receivers,facades);
    watchersInView(visible);
    trafficInView(eye, sun.castShadow ? shadow : null);
  };
}
