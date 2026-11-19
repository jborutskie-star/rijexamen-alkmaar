// Keep the animation's complete instance table. Each render pass reads only the
// current poses that can contribute a boat or bird to the picture.
import { InstancedMesh, Matrix4, Sphere, DynamicDrawUsage } from 'three';

export function movingCanalInstances(scene, shadowFrustum) {
  const sources=[], transform=new Matrix4(), pose=new Matrix4(), sphere=new Sphere();
  scene.traverse(mesh=>{if(mesh.userData.movingCanalInstances) sources.push(mesh);});

  function pass(source, shadow) {
    const draw=new InstancedMesh(source.geometry,source.material,source.count);
    draw.instanceMatrix.setUsage(DynamicDrawUsage);
    if(source.instanceColor) draw.instanceColor=source.instanceColor.clone().setUsage(DynamicDrawUsage);
    draw.matrixAutoUpdate=false;
    draw.matrix.copy(source.matrix);
    draw.castShadow=shadow;
    draw.receiveShadow=source.receiveShadow;
    draw.intersectsFrustum=frustum=>shadow ? frustum===shadowFrustum : frustum!==shadowFrustum;
    source.parent.add(draw);
    return draw;
  }

  const groups=sources.map(source=>{
    source.geometry.computeBoundingSphere();
    source.visible=false;
    return {source,eye:pass(source,false),sun:source.castShadow?pass(source,true):null};
  });

  function append(draw,source,row) {
    draw.setMatrixAt(draw.count,pose);
    if(draw.instanceColor) {
      const src=source.instanceColor.array, i=row*3;
      draw.instanceColor.setXYZ(draw.count,src[i],src[i+1],src[i+2]);
    }
    draw.count++;
  }

  function finish(draw) {
    draw.visible=draw.count>0;
    if(!draw.visible) return;
    draw.instanceMatrix.clearUpdateRanges();
    draw.instanceMatrix.addUpdateRange(0,draw.count*16);
    draw.instanceMatrix.needsUpdate=true;
    if(draw.instanceColor) {
      draw.instanceColor.clearUpdateRanges();
      draw.instanceColor.addUpdateRange(0,draw.count*3);
      draw.instanceColor.needsUpdate=true;
    }
  }

  return (camera,shadow,receivers,facades)=>{
    for(const {source,eye,sun} of groups) {
      eye.count=0;
      if(sun) sun.count=0;
      for(let i=0;i<source.count;i++) {
        source.getMatrixAt(i,pose);
        transform.multiplyMatrices(source.matrixWorld,pose);
        sphere.copy(source.geometry.boundingSphere).applyMatrix4(transform);
        if(camera.intersectsSphere(sphere) && !facades.hidden(sphere)) append(eye,source,i);
        if(sun && shadow && shadow.intersectsSphere(sphere) && receivers.sphere(sphere)) append(sun,source,i);
      }
      finish(eye);
      if(sun) finish(sun);
    }
  };
}
