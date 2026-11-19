// Painted rigid components with the same lighting and shadow settings share a draw.
// Call at construction, before assigning a global environment probe or animating the assembly.
import * as THREE from 'three';

export function packPaintedParts(group, parts = group.children) {
  const sets = new Map();
  for (const part of parts) {
    const m = part.material, g = part.geometry;
    if (part.parent !== group || !part.visible || !part.isMesh || part.isSkinnedMesh || part.isInstancedMesh ||
        part.children.length || part.morphTargetInfluences?.length || !g.attributes.normal ||
        g.drawRange.start !== 0 || g.drawRange.count !== Infinity || m?.type !== 'MeshStandardMaterial' ||
        m.transparent || m.opacity !== 1 || m.alphaTest || m.blending !== THREE.NormalBlending ||
        m.emissive.getHex() || m.stencilWrite || m.polygonOffset || m.clippingPlanes || m.wireframe ||
        m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile ||
        Object.values(m).some(value => value?.isTexture)) continue;
    const key = [m.roughness,m.metalness,m.side,m.shadowSide,m.flatShading,m.envMapIntensity,
      m.toneMapped,m.depthTest,m.depthWrite,m.colorWrite,m.depthFunc,m.fog,
      part.castShadow,part.receiveShadow,part.renderOrder,part.layers.mask].join('/');
    if (!sets.has(key)) sets.set(key,[]);
    sets.get(key).push(part);
  }
  for (const pieces of sets.values()) {
    if (pieces.length < 2) continue;
    const positions = [], normals = [], colors = [], indices = [];
    const tint = new THREE.Color();
    for (const part of pieces) {
      if (part.matrixAutoUpdate) part.updateMatrix();
      const g = part.geometry.clone().applyMatrix4(part.matrix);
      const {position,normal,color} = g.attributes, start = positions.length / 3;
      for (let i=0;i<position.count;i++) {
        positions.push(position.getX(i),position.getY(i),position.getZ(i));
        normals.push(normal.getX(i),normal.getY(i),normal.getZ(i));
        tint.copy(part.material.color);
        if (part.material.vertexColors && color) {
          tint.r *= color.getX(i); tint.g *= color.getY(i); tint.b *= color.getZ(i);
        }
        colors.push(tint.r,tint.g,tint.b);
      }
      const count = g.index?.count ?? position.count, mirrored = part.matrix.determinant() < 0;
      for (let i=0;i<count;i+=3) {
        const a = g.index ? g.index.getX(i) : i, b = g.index ? g.index.getX(i+1) : i+1,
          c = g.index ? g.index.getX(i+2) : i+2;
        indices.push(start+a,start+(mirrored?c:b),start+(mirrored?b:c));
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.setIndex(indices);
    const first = pieces[0], material=first.material.clone();
    material.color.set(0xffffff); material.vertexColors=true;
    const combined = new THREE.Mesh(geometry,material);
    combined.castShadow=first.castShadow; combined.receiveShadow=first.receiveShadow;
    combined.renderOrder=first.renderOrder; combined.layers.mask=first.layers.mask;
    group.remove(...pieces); group.add(combined);
  }
}
