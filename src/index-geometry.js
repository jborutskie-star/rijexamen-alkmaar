// Procedural models arrive as triangle soup. Share a vertex only when every
// attribute is bit-identical, so seams, flat normals, paint and decals survive.
import * as THREE from 'three';

export function indexGeometry(geometry) {
  const attributes=Object.entries(geometry.attributes);
  const count=geometry.attributes.position?.count;
  if (!count || count<24 || geometry.index || attributes.some(([,a]) =>
    a.isInterleavedBufferAttribute || a.isInstancedBufferAttribute || !(a.array instanceof Float32Array) ||
    a.count!==count || a.usage!==THREE.StaticDrawUsage)) return;
  const fields=attributes.map(([,a])=>({
    bits:new Uint32Array(a.array.buffer,a.array.byteOffset,a.array.length),
    size:a.itemSize,
  }));
  let capacity=1;
  while (capacity<count*1.5) capacity*=2;
  const slots=new Uint32Array(capacity), indices=new Uint32Array(count), first=new Uint32Array(count);
  let unique=0;
  for (let i=0;i<count;i++) {
    let hash=2166136261;
    for (const {bits,size} of fields) {
      for (let j=i*size,end=j+size;j<end;j++) hash=Math.imul(hash^bits[j],16777619);
    }
    let slot=(hash^(hash>>>16))&(capacity-1), index;
    while ((index=slots[slot])!==0) {
      const original=first[index-1];
      let same=true;
      for (const {bits,size} of fields) {
        for(let j=0;j<size;j++) if (bits[i*size+j]!==bits[original*size+j]) {same=false;break;}
        if (!same) break;
      }
      if (same) break;
      slot=(slot+1)&(capacity-1);
    }
    if (!index) {first[unique]=i;index=++unique;slots[slot]=index;}
    indices[i]=index-1;
  }
  if (unique>count*.9) return;
  for (const [name,attr] of attributes) {
    const size=attr.itemSize, array=new Float32Array(unique*size);
    for (let i=0;i<unique;i++) for (let j=0;j<size;j++) array[i*size+j]=attr.array[first[i]*size+j];
    geometry.setAttribute(name,new THREE.BufferAttribute(array,size,attr.normalized));
  }
  geometry.setIndex(new THREE.BufferAttribute(unique<65535?new Uint16Array(indices):indices,1));
}
