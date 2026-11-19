// These tiles already contain world-space vertices. Only their draw ranges vary
// between the sun and the film camera, so neither pass needs a transform texture.
import * as THREE from 'three';
import { indexGeometry } from './index-geometry.js';

const frustum = new THREE.Frustum(), projection = new THREE.Matrix4();
const worldShaders = new WeakSet();
function worldSpace(material) {
  if (worldShaders.has(material)) return material;
  worldShaders.add(material);
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = function(shader,renderer) {
    compile.call(this,shader,renderer);
    shader.vertexShader = '#undef USE_BATCHING\n' + shader.vertexShader;
  };
  material.customProgramCacheKey = () => key+'|world-space';
  return material;
}
const tileDepth = () => worldSpace(new THREE.MeshDepthMaterial({colorWrite:false}));

export function staticTiles(sections, material, facades) {
  for (const g of sections) {
    indexGeometry(g);
    // BatchedMesh needs the same index layout on every tile of a material.
    if (!g.index) {
      const array=g.attributes.position.count<65535?Uint16Array:Uint32Array;
      g.setIndex(new THREE.BufferAttribute(array.from({length:g.attributes.position.count},(_,i)=>i),1));
    }
  }
  const indices=sections.reduce((sum,g)=>sum+g.index.count,0);
  const vertices = sections.reduce((n,g) => n+g.attributes.position.count,0);
  const mesh = new THREE.BatchedMesh(sections.length,vertices,indices,worldSpace(material));
  const tiles = sections.map(geometry => {
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const id=mesh.addGeometry(geometry);
    mesh.addInstance(id);
    return {bounds:geometry.boundingBox, sphere:geometry.boundingSphere, ...mesh.getGeometryRangeAt(id)};
  });
  const indexBytes=mesh.geometry.index.array.BYTES_PER_ELEMENT;
  mesh.customDepthMaterial=tileDepth();
  mesh.onBeforeRender = function(renderer,scene,camera) {
    frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),
      camera.coordinateSystem,camera.reversedDepth);
    let count=0;
    for (const tile of tiles) {
      if (!frustum.intersectsBox(tile.bounds) || (camera.isPerspectiveCamera && facades?.hidden(tile.sphere)) ||
          (camera.userData.receivers && !camera.userData.receivers.box(tile.bounds))) continue;
      // The native multi-draw API takes byte offsets for indexed geometry.
      const start=tile.start*indexBytes;
      if (count && this._multiDrawStarts[count-1]+this._multiDrawCounts[count-1]*indexBytes===start) {
        this._multiDrawCounts[count-1]+=tile.count;
      } else {
        this._multiDrawStarts[count]=start;
        this._multiDrawCounts[count++]=tile.count;
      }
    }
    this._multiDrawCount=count;
  };
  return mesh;
}
