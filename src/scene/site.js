import { createElevationSampler, resolveFencePlanGeometry } from '../terrain.js';

/**
 * Default texture factory for ground-anchored street typography when no DOM canvas is supplied.
 * @param {typeof import('three')} THREE
 */
function createFallbackStreetTexture(THREE) {
  return new THREE.CanvasTexture({ width: 1024, height: 128 });
}

/**
 * Default texture factory for overhead satellite/aerial imagery.
 * @param {typeof import('three')} THREE
 * @param {string} url
 */
function createDefaultSatelliteTexture(THREE, url) {
  if (typeof Image !== 'undefined') {
    return new THREE.TextureLoader().load(url);
  }
  const tex = new THREE.Texture();
  tex.userData = { url };
  return tex;
}

/**
 * Builds the static site geometry: lighting, optional satellite imagery overlay,
 * non-overlapping road and sidewalk regions, dashed street centerlines, curb lines,
 * lot/porch/house/shed footprint polygons, lot boundary loop, and ground-anchored street text planes.
 * Free of direct DOM access.
 *
 * @param {Object} options
 * @param {typeof import('three')} options.THREE
 * @param {import('three').Scene} options.scene
 * @param {Object} options.geometry Authoritative site geometry dataset
 * @param {(THREE: typeof import('three'), text: string) => import('three').CanvasTexture} [options.createStreetTexture]
 * @param {(THREE: typeof import('three'), url: string) => import('three').Texture} [options.createSatelliteTexture]
 */
export function addSiteToScene({
  THREE,
  scene,
  geometry,
  createStreetTexture = createFallbackStreetTexture,
  createSatelliteTexture = createDefaultSatelliteTexture,
}) {
  const ownedGeometries = [];
  const ownedMaterials = [];
  const ownedTextures = [];
  const roadText = [];

  const fencePlan = resolveFencePlanGeometry(geometry);
  const sampleElevation = createElevationSampler(geometry.elevation);
  const hasNonFlatTerrain =
    geometry.elevation && geometry.elevation.mode && geometry.elevation.mode !== 'flat';

  scene.add(new THREE.HemisphereLight(0xffffff, 0x758566, 2.4));
  const sun = new THREE.DirectionalLight(0xfff6df, 2);
  sun.position.set(-40, 80, 60);
  scene.add(sun);

  const addGroundPolygon = (points, color, elevationFt) => {
    const shape = new THREE.Shape();
    points.forEach((pt, idx) => (idx ? shape.lineTo(...pt) : shape.moveTo(...pt)));
    shape.closePath();
    const geom = new THREE.ShapeGeometry(shape);
    if (hasNonFlatTerrain) {
      const posAttr = geom.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const px = posAttr.getX(i);
        const py = posAttr.getY(i);
        posAttr.setZ(i, sampleElevation(px, py));
      }
      geom.computeVertexNormals();
    }
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    ownedGeometries.push(geom);
    ownedMaterials.push(mat);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = elevationFt + (hasNonFlatTerrain ? 0 : sampleElevation(0, 0));
    scene.add(mesh);
    return mesh;
  };

  // Optional georeferenced satellite/aerial photo plane
  if (geometry.imagery?.url && geometry.imagery?.bounds) {
    const { minX, maxX, minY, maxY } = geometry.imagery.bounds;
    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const satTexture = createSatelliteTexture(THREE, geometry.imagery.url);
    ownedTextures.push(satTexture);
    const satMat = new THREE.MeshBasicMaterial({
      map: satTexture,
      transparent: (geometry.imagery.opacity ?? 1) < 1,
      opacity: geometry.imagery.opacity ?? 1,
      side: THREE.DoubleSide,
    });
    const satGeom = new THREE.PlaneGeometry(width, height);
    ownedGeometries.push(satGeom);
    ownedMaterials.push(satMat);
    const satMesh = new THREE.Mesh(satGeom, satMat);
    satMesh.name = 'satellite-imagery';
    satMesh.rotation.x = -Math.PI / 2;
    satMesh.rotation.z = geometry.imagery.rotationRad || 0;
    satMesh.position.set(
      centerX,
      (geometry.imagery.elevationFt ?? -0.005) + sampleElevation(centerX, centerY),
      -centerY
    );
    scene.add(satMesh);
  }

  const streetsConfig = geometry.streets;
  if (streetsConfig !== false) {
    const far = streetsConfig?.farExtentFt ?? 10000;
    const roadElev = streetsConfig?.roadElevationFt ?? -0.25;
    const walkElev = streetsConfig?.sidewalkElevationFt ?? -0.015;
    const centerElev = streetsConfig?.centerlineElevationFt ?? -0.2;
    const curbElev = streetsConfig?.curbElevationFt ?? 0.025;
    const westX = (y) => -y * Math.tan(fencePlan.skewRad);

    // Partition pavement around sidewalks rather than stacking almost-coplanar planes.
    const roadRegions = streetsConfig?.roadRegions || [
      [
        [-far, -60],
        [far, -60],
        [far, -6],
        [-far, -6],
      ],
      [
        [-far, -66],
        [far, -66],
        [far, -64],
        [-far, -64],
      ],
      [
        [-far, -2],
        [-49.5, -2],
        [-49.5, 0],
        [-far, 0],
      ],
      [
        [0, -2],
        [far, -2],
        [far, 0],
        [0, 0],
      ],
      [
        [-49.5, -6],
        [0, -6],
        [0, 0],
        [-49.5, 0],
      ],
      ...[
        [-49.5, -47.5],
        [-43.5, -6],
        [-2, 0],
      ].map(([a, b]) => [
        [a, 0],
        [b, 0],
        [westX(far) + b, far],
        [westX(far) + a, far],
      ]),
    ];

    const sidewalkRegions = streetsConfig?.sidewalkRegions || [
      [
        [0, -6],
        [far, -6],
        [far, -2],
        [0, -2],
      ],
      [
        [-far, -6],
        [-49.5, -6],
        [-49.5, -2],
        [-far, -2],
      ],
      [
        [-far, -64],
        [far, -64],
        [far, -60],
        [-far, -60],
      ],
      [
        [-47.5, 0],
        [-43.5, 0],
        [westX(far) - 43.5, far],
        [westX(far) - 47.5, far],
      ],
      [
        [-6, 0],
        [-2, 0],
        [westX(far) - 2, far],
        [westX(far) - 6, far],
      ],
    ];

    for (const points of roadRegions) {
      const mesh = addGroundPolygon(points, 0xf1f0e9, roadElev);
      mesh.name = 'road-surface';
      mesh.userData.plan = points;
    }

    for (const points of sidewalkRegions) {
      const mesh = addGroundPolygon(points, 0xdedfd6, walkElev);
      mesh.name = 'sidewalk-surface';
      mesh.userData.plan = points;
    }

    const centerlinePaths = streetsConfig?.centerlines || [
      [
        [-far, -33],
        [far, -33],
      ],
      [
        [-24.75, 0],
        [westX(far) - 24.75, far],
      ],
    ];

    for (const points of centerlinePaths) {
      const geom = new THREE.BufferGeometry().setFromPoints(
        points.map((p) => new THREE.Vector3(p[0], centerElev, -p[1]))
      );
      const mat = new THREE.LineDashedMaterial({
        color: 0xb8b8a4,
        dashSize: 8,
        gapSize: 7,
      });
      ownedGeometries.push(geom);
      ownedMaterials.push(mat);
      const line = new THREE.Line(geom, mat);
      line.name = 'street-centerline';
      line.computeLineDistances();
      scene.add(line);
    }

    const curbPaths = streetsConfig?.curbs || [
      [
        [0, -6],
        [far, -6],
      ],
      [
        [-far, -6],
        [-49.5, -6],
      ],
      [
        [-far, -60],
        [far, -60],
      ],
      [
        [-6, 0],
        [westX(far) - 6, far],
      ],
      [
        [-43.5, 0],
        [westX(far) - 43.5, far],
      ],
    ];

    for (const points of curbPaths) {
      const geom = new THREE.BufferGeometry().setFromPoints(
        points.map((p) => new THREE.Vector3(p[0], curbElev, -p[1]))
      );
      const mat = new THREE.LineBasicMaterial({ color: 0xc9cec3 });
      ownedGeometries.push(geom);
      ownedMaterials.push(mat);
      const curb = new THREE.Line(geom, mat);
      curb.name = 'street-curb';
      scene.add(curb);
    }
  }

  if (geometry.lot?.length) {
    addGroundPolygon(geometry.lot, 0xe5eddb, 0);
  }
  if (geometry.porches?.length) {
    geometry.porches.forEach((porch) => addGroundPolygon(porch, 0xa7b5a5, 0.025));
  }
  if (geometry.house?.length) {
    addGroundPolygon(geometry.house, 0x5f726c, 0.045);
  }
  if (geometry.shed?.corners?.length) {
    addGroundPolygon(geometry.shed.corners, 0x70899a, 0.06);
  }

  if (geometry.lot?.length) {
    const boundaryGeom = new THREE.BufferGeometry().setFromPoints(
      geometry.lot.map((p) => new THREE.Vector3(p[0], sampleElevation(p[0], p[1]) + 0.02, -p[1]))
    );
    const boundaryMat = new THREE.LineBasicMaterial({ color: 0x9aad8c });
    ownedGeometries.push(boundaryGeom);
    ownedMaterials.push(boundaryMat);
    const boundary = new THREE.LineLoop(boundaryGeom, boundaryMat);
    scene.add(boundary);
  }

  // Ground-anchored street typography: depth tested, never forced over buildings or into view.
  const addStreetText = (name, text, x, z, rotation = 0) => {
    const texture = createStreetTexture(THREE, text);
    ownedTextures.push(texture);
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.85,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const geom = new THREE.PlaneGeometry(25, 3.125);
    ownedGeometries.push(geom);
    ownedMaterials.push(mat);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = name;
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rotation;
    mesh.position.set(x, 0.025, z);
    mesh.userData.baseRotation = rotation;
    scene.add(mesh);
    roadText.push(mesh);
    return mesh;
  };

  if (streetsConfig !== false) {
    const streetLabels = streetsConfig?.labels3D || [
      {
        name: 'street-text-paine',
        text: 'PAINE ST · WEST',
        x: -15,
        z: -54,
        rotationRad: Math.PI / 2,
      },
      {
        name: 'street-text-oakwood',
        text: 'OAKWOOD AVE · SOUTH',
        x: 31,
        z: 19,
        rotationRad: 0,
      },
    ];
    for (const lbl of streetLabels) {
      addStreetText(lbl.name, lbl.text, lbl.x, lbl.z, lbl.rotationRad || 0);
    }
  }

  return {
    roadText,
    disposeSite() {
      ownedGeometries.forEach((g) => g.dispose());
      ownedMaterials.forEach((m) => m.dispose());
      ownedTextures.forEach((t) => t.dispose());
    },
  };
}

/**
 * Updates the rotation of ground-anchored street text meshes so their reading direction
 * stays left-to-right relative to the current camera projection.
 *
 * @param {typeof import('three')} THREE
 * @param {import('three').Mesh[]} roadTextMeshes
 * @param {import('three').Camera} camera
 */
export function updateStreetTextOrientation(THREE, roadTextMeshes, camera) {
  for (const mesh of roadTextMeshes) {
    const baseRot = mesh.userData.baseRotation;
    const startWorld = mesh.position.clone();
    const endWorld = startWorld
      .clone()
      .add(new THREE.Vector3(Math.cos(baseRot), 0, -Math.sin(baseRot)));
    const projectedStart = startWorld.project(camera);
    const projectedEnd = endWorld.project(camera);
    mesh.rotation.z = baseRot + (projectedEnd.x < projectedStart.x ? Math.PI : 0);
  }
}
