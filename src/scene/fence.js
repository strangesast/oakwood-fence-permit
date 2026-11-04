import { createElevationSampler, resolveFencePlanGeometry } from '../terrain.js';

/**
 * Disposes all geometries and materials currently attached to a fence group.
 *
 * @param {import('three').Group} fenceGroup
 * @param {import('three').Material[]} fenceMaterials
 */
export function clearFenceGroup(fenceGroup, fenceMaterials) {
  while (fenceGroup.children.length > 0) {
    const child = fenceGroup.children[0];
    child.geometry?.dispose();
    fenceGroup.remove(child);
  }
  for (const mat of fenceMaterials) {
    mat.dispose();
  }
  fenceMaterials.length = 0;
}

/**
 * Rebuilds the 3D fence meshes (posts, caps, transition rings, rails, and instanced pickets)
 * from the current valid calculation result, parameterized by the site's fence plan and terrain elevation.
 * Free of DOM access.
 *
 * @param {Object} options
 * @param {typeof import('three')} options.THREE
 * @param {import('three').Group} options.fenceGroup
 * @param {import('three').Material[]} options.fenceMaterials Mutable array tracking active fence materials for disposal
 * @param {Object} [options.geometry] Site geometry dataset (for fence plan vectors and elevation sampling)
 * @param {[number, number]} [options.cornerPoint] Explicit NE corner fallback if `geometry` is omitted
 * @param {Record<string, any>} options.values Current input values
 * @param {ReturnType<import('../calc.js').calculate>} options.estimate Current valid calculation result
 */
export function rebuildFenceMeshes({
  THREE,
  fenceGroup,
  fenceMaterials,
  geometry,
  cornerPoint,
  values,
  estimate,
}) {
  clearFenceGroup(fenceGroup, fenceMaterials);

  const fencePlan = resolveFencePlanGeometry(
    geometry || (cornerPoint ? { fencePlan: { corner: cornerPoint } } : undefined)
  );
  const sampleElevation = createElevationSampler(geometry?.elevation);

  const postMat = new THREE.MeshStandardMaterial({ color: 0x243a2c, roughness: 1 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0xa98c62, roughness: 1 });
  const picketMat = new THREE.MeshStandardMaterial({ color: 0xdbc59e, roughness: 1 });
  const shortMat = new THREE.MeshStandardMaterial({ color: 0xecdaba, roughness: 1 });
  const transitionMat = new THREE.MeshBasicMaterial({ color: 0xb67531 });

  fenceMaterials.push(postMat, railMat, picketMat, shortMat, transitionMat);

  const addBox = (width, height, depth, planPt, localY, material, rotationY = 0) => {
    const groundY = sampleElevation(planPt[0], planPt[1]);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(planPt[0], groundY + localY, -planPt[1]);
    mesh.rotation.y = rotationY;
    fenceGroup.add(mesh);
    return mesh;
  };

  const addPostWithCap = (planPt, heightFt) => {
    const postSizeFt = values.post / 12;
    const capSizeFt = postSizeFt * 1.25;
    addBox(postSizeFt, heightFt + 0.25, postSizeFt, planPt, (heightFt + 0.25) / 2, postMat);
    addBox(capSizeFt, 0.12, capSizeFt, planPt, heightFt + 0.29, postMat);
  };

  for (const run of estimate.runs) {
    const runSpec = fencePlan.runs[run.key] || fencePlan.runs.east;
    const rotationY = runSpec.rotationY;
    const [offsetX, offsetZ] = runSpec.picketOffset3D;

    for (const post of run.posts) {
      const postPt = fencePlan.pointAt(run.key, post.distance);
      addPostWithCap(postPt, post.height);

      if (post.isTransition) {
        const groundY = sampleElevation(postPt[0], postPt[1]);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.1, 6, 24), transitionMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(postPt[0], groundY + 0.08, -postPt[1]);
        fenceGroup.add(ring);
      }
    }

    for (const seg of run.segments) {
      for (let bay = 0; bay < seg.bays; bay++) {
        for (let level = 0; level < seg.rails; level++) {
          const levelFraction = seg.rails === 1 ? 0.5 : level / (seg.rails - 1);
          const railY = 0.7 + (seg.height - 1.4) * levelFraction;
          const bayCenterDist = seg.start + (bay + 0.5) * seg.bayLength;
          const bayCenterPt = fencePlan.pointAt(run.key, bayCenterDist);
          addBox(seg.bayLength, 0.29, 0.13, bayCenterPt, railY, railMat, rotationY);
        }
      }

      const picketGeom = new THREE.BoxGeometry(values.width / 12, seg.height, 0.06);
      const picketMaterial = seg.height === 6 ? picketMat : shortMat;
      const instancedPickets = new THREE.InstancedMesh(picketGeom, picketMaterial, seg.pickets);
      const dummy = new THREE.Object3D();

      for (let i = 0; i < seg.pickets; i++) {
        const picketDist = seg.start + Math.min(seg.length, ((i + 0.5) * seg.length) / seg.pickets);
        const picketPt = fencePlan.pointAt(run.key, picketDist);
        const groundY = sampleElevation(picketPt[0], picketPt[1]);
        dummy.position.set(picketPt[0] + offsetX, groundY + seg.height / 2, -picketPt[1] + offsetZ);
        dummy.rotation.y = rotationY;
        dummy.updateMatrix();
        instancedPickets.setMatrixAt(i, dummy.matrix);
      }

      fenceGroup.add(instancedPickets);
    }
  }

  if (estimate.posts > 0) {
    addPostWithCap(fencePlan.corner, estimate.cornerHeight);
  }
}
