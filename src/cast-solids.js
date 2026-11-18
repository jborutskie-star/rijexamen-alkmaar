// The opaque paint, cloth and skin on an actor share a draw. Each original joint
// still drives its own rigid vertices, including when the car pitches or a wrist turns.
import * as THREE from 'three';

const identity = new THREE.Matrix4();
const finish = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
const shadow = new THREE.MeshDepthMaterial();
const rigidVertices = shader => {
  shader.vertexShader = shader.vertexShader
    .replace('#include <skinbase_vertex>', 'mat4 joint = bindMatrixInverse * getBoneMatrix(skinIndex.x);')
    .replace('#include <skinnormal_vertex>', 'objectNormal = mat3(joint) * objectNormal;')
    .replace('#include <skinning_vertex>', 'transformed = (joint * vec4(transformed, 1.)).xyz;');
};
shadow.onBeforeCompile = rigidVertices;
finish.onBeforeCompile = shader => {
  rigidVertices(shader);
  shader.vertexShader = 'attribute float surfaceRoughness; varying float vSurfaceRoughness;\n' +
    shader.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>\nvSurfaceRoughness = surfaceRoughness;');
  shader.fragmentShader = 'varying float vSurfaceRoughness;\n' +
    shader.fragmentShader.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurfaceRoughness;');
};

export function batchCastSolids(root, radius, skip = []) {
  const batches = new Map(), bones = [], excluded = new Set(skip);
  function collect(part) {
    if (excluded.has(part)) return;
    const m = part.material;
    if (part.isMesh && !part.children.length && m.isMeshStandardMaterial && m.side === THREE.FrontSide &&
        !m.map && !m.transparent && !m.metalness && !m.emissive.getHex() && m.roughness > .5) {
      const key = +part.castShadow * 2 + +part.receiveShadow;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(part);
      if (!bones.includes(part.parent)) bones.push(part.parent);
    } else {
      for (const child of part.children) collect(child);
    }
  }
  collect(root);
  const skeleton = new THREE.Skeleton(bones, bones.map(() => identity));
  for (const parts of batches.values()) {
    if (parts.length < 2) continue;
    const positions = [], normals = [], colors = [], roughness = [], jointIndices = [], weights = [], indices = [];
    const tint = new THREE.Color();
    for (const part of parts) {
      part.updateMatrix();
      const g = part.geometry.clone().applyMatrix4(part.matrix);
      const { position, normal, color } = g.attributes, material = part.material, offset = roughness.length;
      const joint = bones.indexOf(part.parent);
      for (let v = 0; v < position.count; v++) {
        positions.push(position.getX(v), position.getY(v), position.getZ(v));
        normals.push(normal.getX(v), normal.getY(v), normal.getZ(v));
        tint.copy(material.color);
        if (material.vertexColors && color) {
          tint.r *= color.getX(v); tint.g *= color.getY(v); tint.b *= color.getZ(v);
        }
        colors.push(tint.r, tint.g, tint.b);
        roughness.push(material.roughness); jointIndices.push(joint, 0, 0, 0); weights.push(255, 0, 0, 0);
      }
      const count = g.index ? g.index.count : position.count;
      for (let i = 0; i < count; i++) indices.push(offset + (g.index ? g.index.getX(i) : i));
      part.visible = false; // the clipboard audit still checks each original local box
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('surfaceRoughness', new THREE.Float32BufferAttribute(roughness, 1));
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(jointIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Uint8BufferAttribute(weights, 4, true));
    geometry.setIndex(indices);
    const mesh = new THREE.SkinnedMesh(geometry, finish);
    mesh.bind(skeleton, identity);
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, .7, 0), radius);
    mesh.castShadow = parts[0].castShadow; mesh.receiveShadow = parts[0].receiveShadow;
    mesh.customDepthMaterial = shadow;
    root.add(mesh);
  }
}
