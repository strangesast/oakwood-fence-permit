import siteGeometry from '../data/site.json' with { type: 'json' };
import { createElevationSampler } from '../terrain.js';

/**
 * Parameterized low-poly 3D building massing (house and accessory shed) constructed from
 * a site geometry dataset. Supports both detailed architectural specs (`houseModel`)
 * and arbitrary custom footprints/extrusions on flat or elevated terrain. Free of DOM access.
 */

const DEFAULT_HOUSE_MODEL = siteGeometry.houseModel;

/**
 * Computes the height of a wraparound porch roof at plan coordinate (x, y).
 *
 * @param {number} x
 * @param {number} y
 * @param {Object} [porchSpec]
 * @returns {number}
 */
export function getPorchRoofHeight(x, y, porchSpec = DEFAULT_HOUSE_MODEL.porchWraparound) {
  const westX = porchSpec?.westOriginX ?? 25.9;
  const northY = porchSpec?.northOriginY ?? 84.7;
  const eave = porchSpec?.eaveHeightFt ?? 8;
  const slope = porchSpec?.slope ?? 0.12;
  return Math.min(eave + (x - westX) * slope, eave + (northY - y) * slope);
}

function isPointInsidePolygon(point, outline) {
  let inside = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i];
    const b = outline[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function computePorchWallSpans(a, b, porchSpec, wallHeightFt, toVertex) {
  const outline = porchSpec.outline;
  const hipSum = (porchSpec.westOriginX ?? 25.9) + (porchSpec.northOriginY ?? 84.7);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const cuts = [0, 1];
  const cross = (x, y, u, v) => x * v - y * u;

  // Split at the hip and roof perimeter so no triangle bridges two slopes or lowers an uncovered wall.
  const hipT = (hipSum - a[0] - a[1]) / (dx + dy);
  if (hipT > 0 && hipT < 1) {
    cuts.push(hipT);
  }

  for (let i = 0; i < outline.length; i++) {
    const c = outline[i];
    const d = outline[(i + 1) % outline.length];
    const ex = d[0] - c[0];
    const ey = d[1] - c[1];
    const den = cross(dx, dy, ex, ey);
    if (Math.abs(den) < 1e-10) continue;
    const t = cross(c[0] - a[0], c[1] - a[1], ex, ey) / den;
    const u = cross(c[0] - a[0], c[1] - a[1], dx, dy) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) {
      cuts.push(t);
    }
  }

  const ts = [...new Set(cuts)].sort((m, n) => m - n);
  const pointAt = (t) => [a[0] + dx * t, a[1] + dy * t];
  const spans = [];

  for (let i = 0; i < ts.length - 1; i++) {
    if (ts[i + 1] - ts[i] < 1e-9) continue;
    const p = pointAt(ts[i]);
    const q = pointAt(ts[i + 1]);
    const covered = isPointInsidePolygon(pointAt((ts[i] + ts[i + 1]) / 2), outline);
    const wallTopHeight = (pt) =>
      covered ? Math.min(wallHeightFt, getPorchRoofHeight(pt[0], pt[1], porchSpec)) : wallHeightFt;
    spans.push([
      toVertex(p[0], p[1], 0),
      toVertex(q[0], q[1], 0),
      toVertex(q[0], q[1], wallTopHeight(q)),
      toVertex(p[0], p[1], wallTopHeight(p)),
    ]);
  }

  return spans;
}

function clipPolygonByHipLine(polygon, hipSum, side) {
  const out = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const fa = (a[0] + a[1] - hipSum) * side;
    const fb = (b[0] + b[1] - hipSum) * side;
    if (fa >= -1e-8) {
      out.push(a);
    }
    if ((fa > 0 && fb < 0) || (fa < 0 && fb > 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

/**
 * Adds the 3D shed and house groups to the scene from `geometry` parameters and prepares
 * isolated normal and translucent ghost materials on each building mesh.
 *
 * @param {Object} options
 * @param {typeof import('three')} options.THREE
 * @param {import('three').Scene} options.scene
 * @param {Object} options.geometry Authoritative site geometry dataset
 */
export function addBuildingsToScene({ THREE, scene, geometry }) {
  const buildingMeshes = [];
  const sampleElevation = createElevationSampler(geometry.elevation);

  // 1. Scaled shed (optional: only built when `geometry.shed` is provided)
  const shed = new THREE.Group();
  shed.name = 'scaled-shed';
  const sh = geometry.shed;

  if (sh && sh.width_ft && sh.depth_ft) {
    const shedElev = sampleElevation(sh.center[0], sh.center[1]);
    shed.position.set(sh.center[0], shedElev, -sh.center[1]);
    shed.rotation.y = sh.angle_rad || 0;
    scene.add(shed);

    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xbcc5bf, roughness: 0.95 });
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: 0x40565e,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });

    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(sh.width_ft, sh.wall_height_ft, sh.depth_ft),
      wallMaterial
    );
    walls.name = 'shed-walls';
    walls.position.y = sh.wall_height_ft / 2;
    shed.add(walls);

    const hw = sh.width_ft / 2;
    const hd = sh.depth_ft / 2;
    const o = sh.overhang_ft ?? 0.5;
    const r = sh.ridge_height_ft ?? sh.wall_height_ft + 2;
    const e = sh.wall_height_ft - o * ((r - sh.wall_height_ft) / hd);

    const addShedFace = (name, coords, mat) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name;
      shed.add(mesh);
    };

    for (const side of [-1, 1]) {
      const z = side * (hd + o);
      const x = hw + o;
      addShedFace(
        `shed-roof-${side}`,
        [-x, e, z, x, e, z, x, r, 0, -x, e, z, x, r, 0, -x, r, 0],
        roofMaterial
      );
    }

    for (const side of [-1, 1]) {
      const x = side * hw;
      addShedFace(
        `shed-gable-${side}`,
        [x, sh.wall_height_ft, -hd, x, sh.wall_height_ft, hd, x, r, 0],
        new THREE.MeshStandardMaterial({
          color: 0xbcc5bf,
          roughness: 0.95,
          side: THREE.DoubleSide,
        })
      );
    }

    const shedTrim = new THREE.MeshStandardMaterial({ color: 0xe7ece7 });
    const shedDoor = new THREE.MeshStandardMaterial({ color: 0xb8c2bf });
    const fasciaMat = new THREE.MeshStandardMaterial({ color: 0xbf9b6e });

    const addShedBox = (name, w, h, d, x, y, z, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.name = name;
      shed.add(mesh);
      return mesh;
    };

    addShedBox('shed-front-trim', 0.12, 6.3, 2.8, -hw - 0.03, 3.15, 0, shedTrim);
    addShedBox('shed-double-door', 0.14, 5.9, 2.4, -hw - 0.1, 3.15, 0, shedDoor);
    addShedBox('shed-door-center', 0.16, 5.9, 0.07, -hw - 0.19, 3.15, 0, shedTrim);
    addShedBox('shed-side-trim', 2.6, 6.3, 0.12, 2.3, 3.15, hd + 0.03, shedTrim);
    addShedBox('shed-side-door', 2.2, 5.9, 0.14, 2.3, 3.15, hd + 0.1, shedDoor);

    for (const x of [-hw, hw]) {
      for (const z of [-hd, hd]) {
        addShedBox('shed-corner-trim', 0.16, 7, 0.16, x, 3.5, z, shedTrim);
      }
    }

    for (const x of [-hw - o, hw + o]) {
      for (const side of [-1, 1]) {
        const length = Math.hypot(hd + o, r - e);
        const rake = addShedBox(
          'shed-rake',
          0.14,
          0.2,
          length,
          x,
          (r + e) / 2,
          (side * (hd + o)) / 2,
          fasciaMat
        );
        rake.rotation.x = side * Math.atan2(r - e, hd + o);
      }
    }

    for (const z of [-hd - o, hd + o]) {
      addShedBox('shed-eave', sh.width_ft + 2 * o, 0.2, 0.14, 0, e, z, fasciaMat);
    }
  }

  // 2. Parameterized low-poly house
  const house = new THREE.Group();
  house.name = 'low-poly-house';
  scene.add(house);

  const hm =
    geometry.houseModel !== undefined
      ? geometry.houseModel
      : geometry.house === siteGeometry.house
        ? DEFAULT_HOUSE_MODEL
        : { wallHeightFt: 9 };

  const wallHeightFt = hm?.wallHeightFt ?? 9;
  const porchWrap = hm?.porchWraparound;

  const lightWall = new THREE.MeshStandardMaterial({
    color: 0xc6ceca,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const darkRoof = new THREE.MeshStandardMaterial({
    color: 0x434b4e,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  const trim = new THREE.MeshStandardMaterial({ color: 0xe8ebe4, roughness: 1 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x435962, roughness: 0.65 });
  const shutters = new THREE.MeshStandardMaterial({ color: 0x30373c });
  const redTrim = new THREE.MeshStandardMaterial({ color: 0x7e4847 });

  const toHouseVertex = (x, y, heightFt) => [x, sampleElevation(x, y) + heightFt, -y];

  const addHousePanels = (name, panels, mat = lightWall) => {
    const positions = [];
    for (const points of panels) {
      for (let i = 1; i < points.length - 1; i++) {
        positions.push(...points[0], ...points[i], ...points[i + 1]);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    house.add(mesh);
    return mesh;
  };

  const addHouseFace = (name, points, mat = lightWall) => addHousePanels(name, [points], mat);

  const addHouseBox = (name, w, h, d, x, y, z, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, sampleElevation(x, y) + z, -y);
    mesh.name = name;
    house.add(mesh);
    return mesh;
  };

  if (geometry.house?.length) {
    const [covStart, covEnd] = porchWrap?.coveredWallRange || [-1, -1];
    geometry.house.forEach((a, i) => {
      const b = geometry.house[(i + 1) % geometry.house.length];
      const spans =
        porchWrap && i >= covStart && i <= covEnd
          ? computePorchWallSpans(a, b, porchWrap, wallHeightFt, toHouseVertex)
          : [
              [
                toHouseVertex(a[0], a[1], 0),
                toHouseVertex(b[0], b[1], 0),
                toHouseVertex(b[0], b[1], wallHeightFt),
                toHouseVertex(a[0], a[1], wallHeightFt),
              ],
            ];
      addHousePanels(`survey-wall-${i}`, spans);
    });
  }

  const addGableMass = ({
    name,
    x0,
    x1,
    y0,
    y1,
    eave,
    ridge,
    overhang = 0.7,
    baseHeight = wallHeightFt,
  }) => {
    addHouseFace(`${name}-west`, [
      toHouseVertex(x0, y0, baseHeight),
      toHouseVertex(x0, y1, baseHeight),
      toHouseVertex(x0, y1, eave),
      toHouseVertex(x0, y0, eave),
    ]);
    addHouseFace(`${name}-east`, [
      toHouseVertex(x1, y0, baseHeight),
      toHouseVertex(x1, y1, baseHeight),
      toHouseVertex(x1, y1, eave),
      toHouseVertex(x1, y0, eave),
    ]);
    for (const y of [y0, y1]) {
      addHouseFace(`${name}-gable`, [
        toHouseVertex(x0, y, baseHeight),
        toHouseVertex(x1, y, baseHeight),
        toHouseVertex(x1, y, eave),
        toHouseVertex((x0 + x1) / 2, y, ridge),
        toHouseVertex(x0, y, eave),
      ]);
    }
    const slope = (ridge - eave) / ((x1 - x0) / 2);
    const low = eave - overhang * slope;
    addHouseFace(
      `${name}-roof-west`,
      [
        toHouseVertex(x0 - overhang, y0 - overhang, low),
        toHouseVertex((x0 + x1) / 2, y0 - overhang, ridge),
        toHouseVertex((x0 + x1) / 2, y1 + overhang, ridge),
        toHouseVertex(x0 - overhang, y1 + overhang, low),
      ],
      darkRoof
    );
    addHouseFace(
      `${name}-roof-east`,
      [
        toHouseVertex((x0 + x1) / 2, y0 - overhang, ridge),
        toHouseVertex(x1 + overhang, y0 - overhang, low),
        toHouseVertex(x1 + overhang, y1 + overhang, low),
        toHouseVertex((x0 + x1) / 2, y1 + overhang, ridge),
      ],
      darkRoof
    );
  };

  if (hm?.gables?.length) {
    for (const gableSpec of hm.gables) {
      addGableMass(gableSpec);
    }
  } else if (hm?.flatRoof && geometry.house?.length >= 3) {
    // Generic flat roof cap for custom extruded footprints when no gables are specified
    const shape = new THREE.Shape();
    geometry.house.forEach((p, idx) => (idx ? shape.lineTo(...p) : shape.moveTo(...p)));
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const px = pa.getX(i);
      const py = pa.getY(i);
      pa.setXYZ(i, px, sampleElevation(px, py) + wallHeightFt, -py);
    }
    geo.computeVertexNormals();
    const roofMesh = new THREE.Mesh(geo, darkRoof);
    roofMesh.name = 'flat-house-roof';
    house.add(roofMesh);
  }

  // Wraparound porch closures, hipped roof planes, and rear posts
  if (porchWrap) {
    const hipSum = (porchWrap.westOriginX ?? 25.9) + (porchWrap.northOriginY ?? 84.7);

    for (const { name, from: a, to: b } of porchWrap.closures || []) {
      const t = (hipSum - a[0] - a[1]) / (b[0] + b[1] - a[0] - a[1]);
      const points = [a];
      if (t > 0 && t < 1) {
        points.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
      points.push(b);
      addHousePanels(
        `porch-house-closure-${name}`,
        points.slice(1).map((q, i) => {
          const p = points[i];
          return [
            toHouseVertex(p[0], p[1], getPorchRoofHeight(p[0], p[1], porchWrap)),
            toHouseVertex(q[0], q[1], getPorchRoofHeight(q[0], q[1], porchWrap)),
            toHouseVertex(q[0], q[1], wallHeightFt),
            toHouseVertex(p[0], p[1], wallHeightFt),
          ];
        })
      );
    }

    for (const [name, side] of [
      ['west', -1],
      ['north', 1],
    ]) {
      const points = clipPolygonByHipLine(porchWrap.outline, hipSum, side);
      const shape = new THREE.Shape();
      points.forEach((p, idx) => (idx ? shape.lineTo(...p) : shape.moveTo(...p)));
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      const pa = geo.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i);
        const y = pa.getY(i);
        const h = getPorchRoofHeight(x, y, porchWrap);
        pa.setXYZ(i, x, sampleElevation(x, y) + h, -y);
      }
      geo.computeVertexNormals();
      const roof = new THREE.Mesh(geo, darkRoof);
      roof.name = `hipped-${name}-porch-roof`;
      house.add(roof);
    }

    const rearPorch = geometry.porches?.[1];
    if (rearPorch && porchWrap.rearPosts) {
      for (const idx of porchWrap.rearPosts) {
        const q = rearPorch[idx];
        if (q) {
          addHouseBox('rear-porch-post', 0.35, 8, 0.35, q[0], q[1], 4, trim);
        }
      }
    }
  }

  if (hm?.eastWingRoof?.length) {
    addHouseFace(
      'east-wing-roof',
      hm.eastWingRoof.map(([x, y, h]) => toHouseVertex(x, y, h)),
      darkRoof
    );
  }

  if (hm?.westBayHip?.perimeter?.length) {
    const { eaveHeightFt = 9.1, apex, perimeter } = hm.westBayHip;
    for (let i = 0; i < perimeter.length; i++) {
      const a = perimeter[i];
      const b = perimeter[(i + 1) % perimeter.length];
      addHouseFace(
        'west-bay-hip',
        [
          toHouseVertex(a[0], a[1], eaveHeightFt),
          toHouseVertex(b[0], b[1], eaveHeightFt),
          toHouseVertex(apex[0], apex[1], apex[2]),
        ],
        darkRoof
      );
    }
  }

  if (hm?.frontPorch) {
    const fpSpec = hm.frontPorch;
    const fp = fpSpec.roofCorners.map(([x, y, h]) => toHouseVertex(x, y, h));
    const [ra, rb] = fpSpec.ridge.map(([x, y, h]) => toHouseVertex(x, y, h));
    addHouseFace('front-porch-hip-front', [fp[0], fp[1], rb, ra], darkRoof);
    addHouseFace('front-porch-hip-east', [fp[1], fp[2], rb], darkRoof);
    addHouseFace('front-porch-hip-west', [fp[3], fp[0], ra], darkRoof);

    for (const x of fpSpec.postXs || []) {
      addHouseBox('porch-post', 0.38, 7.8, 0.38, x, fpSpec.postY, 3.9, trim);
    }
    if (fpSpec.deck) {
      const { w, h, d, x, y, z } = fpSpec.deck;
      addHouseBox('porch-deck', w, h, d, x, y, z, lightWall);
    }
    for (const z of fpSpec.railZs || []) {
      addHouseBox('porch-front-rail', 12.2, 0.16, 0.16, 37.1, 28.85, z, trim);
    }
    for (const x of fpSpec.balusterXs || []) {
      addHouseBox('porch-baluster', 0.13, 1.4, 0.13, x, 28.85, 2.7, trim);
    }
    if (fpSpec.steps) {
      const st = fpSpec.steps;
      for (let i = 0; i < st.count; i++) {
        addHouseBox(
          'porch-step',
          st.w,
          st.h,
          st.d,
          st.x,
          st.startY - i * st.stepY,
          st.startZ - i * st.stepZ,
          lightWall
        );
      }
    }
  }

  const addFrontWindow = (x, heightFt) => {
    addHouseBox('window-burgundy-trim', 3.3, 5.4, 0.12, x, 35.15, heightFt, redTrim);
    addHouseBox('window-white-frame', 2.8, 4.9, 0.14, x, 35.07, heightFt, trim);
    addHouseBox('window-glass', 2.4, 4.5, 0.15, x, 34.99, heightFt, glass);
    addHouseBox('window-sash', 2.5, 0.12, 0.18, x, 34.88, heightFt, trim);
    for (const side of [-1, 1]) {
      addHouseBox('window-shutter', 0.9, 5.3, 0.15, x + side * 2.1, 35.05, heightFt, shutters);
    }
  };

  for (const win of hm?.frontWindows || []) {
    addFrontWindow(win.x, win.z);
  }

  if (hm?.westWindows) {
    for (const y of hm.westWindows.ys) {
      for (const z of hm.westWindows.zs) {
        addHouseBox('west-window-trim', 0.16, 5.4, 3.3, 29.55, y, z, redTrim);
        addHouseBox('west-window', 0.18, 4.8, 2.7, 29.44, y, z, glass);
      }
    }
  }

  if (hm?.bayWindows) {
    for (const y of hm.bayWindows.ys) {
      addHouseBox('bay-window-trim', 0.16, 5.4, 2.5, 27.05, y, hm.bayWindows.z, redTrim);
      addHouseBox('bay-window', 0.18, 4.8, 2.1, 26.94, y, hm.bayWindows.z, glass);
    }
  }

  if (hm?.frontDoor) {
    addHouseBox('front-door-frame', 3.5, 7, 0.18, hm.frontDoor.x, 35.05, hm.frontDoor.z, trim);
    addHouseBox('front-door', 2.9, 6.5, 0.2, hm.frontDoor.x, 34.9, hm.frontDoor.z, shutters);
  }

  // Prepare isolated normal and translucent ghost materials for every building mesh.
  for (const group of [house, shed]) {
    group.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.userData.normalMaterial = mesh.material;
      const ghost = mesh.material.clone();
      ghost.transparent = true;
      ghost.opacity = 0.14;
      ghost.depthWrite = false;
      ghost.forceSinglePass = true;
      mesh.userData.ghostMaterial = ghost;
      buildingMeshes.push(mesh);
    });
  }

  return {
    house,
    shed,
    buildingMeshes,
    disposeBuildings() {
      const disposedMaterials = new Set();
      for (const mesh of buildingMeshes) {
        mesh.geometry?.dispose();
        for (const mat of [mesh.userData.normalMaterial, mesh.userData.ghostMaterial]) {
          if (mat && !disposedMaterials.has(mat)) {
            disposedMaterials.add(mat);
            mat.dispose();
          }
        }
      }
    },
  };
}

/**
 * Applies the selected building visibility mode ('normal' | 'ghost' | 'footprint')
 * to all building meshes.
 *
 * @param {import('three').Mesh[]} buildingMeshes
 * @param {'normal' | 'ghost' | 'footprint'} buildingMode
 */
export function applyBuildingVisibilityMode(buildingMeshes, buildingMode) {
  for (const mesh of buildingMeshes) {
    mesh.visible = buildingMode !== 'footprint';
    mesh.material =
      buildingMode === 'ghost' ? mesh.userData.ghostMaterial : mesh.userData.normalMaterial;
  }
}
