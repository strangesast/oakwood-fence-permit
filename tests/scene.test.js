import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate, defaults } from '../src/calc.js';
import geometry from '../src/data/site.json' with { type: 'json' };
import { THREE } from '../src/scene/index.js';
import { createViewer } from '../src/viewer.js';

function createViewerTestDom() {
  const els = {};
  const getEl = (id) => {
    if (!els[id]) {
      els[id] = {
        id,
        style: {},
        clientWidth: 390,
        clientHeight: 340,
        hidden: false,
        disabled: false,
        textContent: '',
        innerHTML: '',
        listeners: {},
        addEventListener(type, fn) {
          this.listeners[type] = fn;
        },
        setAttribute(k, v) {
          this[k] = v;
        },
        toggleAttribute(k, force) {
          this[k] = force === undefined ? !this[k] : Boolean(force);
        },
        appendChild() {},
        replaceChildren() {},
        querySelector() {
          return getEl('value');
        },
        prepend(child) {
          this.prepended = child;
        },
        remove() {},
        getContext() {
          return { fillText() {} };
        },
        getBoundingClientRect() {
          return { left: 0, top: 0, width: 390, height: 340 };
        },
      };
    }
    return els[id];
  };

  return {
    els,
    doc: {
      getElementById: getEl,
      createElement: (tag) => getEl(tag),
      querySelector: (sel) => getEl(sel),
    },
  };
}

test('3D scene geometry, BOM counts, shed, house, roofs, streets, compass, and building modes', async () => {
  const { els, doc } = createViewerTestDom();
  let renders = 0;
  let lastScene = null;
  let lastCamera = null;
  let disposed = false;

  const mockRenderer = {
    setPixelRatio() {},
    setSize() {},
    domElement: doc.getElementById('canvas'),
    render(scene, camera) {
      renders++;
      lastScene = scene;
      lastCamera = camera;
      assert(scene.isScene);
      assert(camera.isCamera);
    },
    dispose() {
      disposed = true;
    },
  };

  const viewer = createViewer({
    doc,
    geometry,
    initialState: { values: defaults, estimate: calculate(defaults) },
    createRenderer: () => mockRenderer,
  });

  await viewer.ready;

  assert(!els.viewstatus.textContent.includes('unavailable'));
  assert(lastCamera.position.x < 0, 'Camera west of lot');
  assert(lastCamera.position.z > 0, 'Camera south of lot');

  const polygonMeshes = lastScene.children.filter((x) => x.geometry?.type === 'ShapeGeometry');
  assert.equal(
    polygonMeshes.length,
    18,
    'Roads, sidewalks, lot, house, two porches and schematic shed'
  );

  for (const v of [
    defaults,
    { ...defaults, em: 'split', et: 40, nm: 'split', nt: 20 },
    { ...defaults, east: 0, north: 0 },
    { ...defaults, em: '4', nm: '4' },
  ]) {
    const c = calculate(v);
    viewer.update({ values: v, estimate: c });
    viewer.fit();
    const fence = viewer.getState().fenceGroup;
    const pickets = fence.children
      .filter((x) => x.isInstancedMesh)
      .reduce((a, x) => a + x.count, 0);
    assert.equal(
      pickets,
      c.pickets.reduce((a, g) => a + g.qty, 0)
    );
    const dark = fence.children.filter((x) => x.material?.color?.getHex() === 0x243a2c);
    assert.equal(dark.length, c.posts * 2, 'One dark post and cap per physical post');
    const actualRailCount = fence.children.filter(
      (x) => x.material?.color?.getHex() === 0xa98c62
    ).length;
    assert.equal(
      actualRailCount,
      c.railGroups.reduce((a, g) => a + g.qty, 0)
    );
  }
  assert(renders >= 8);

  // Eight 2D/3D round trips keep render layers mutually exclusive
  for (let i = 0; i < 8; i++) {
    els.button.onclick();
    assert.equal(els.scene.style.display, 'none');
    assert.equal(els.fallback.style.display, 'block');
    els.button.onclick();
    assert.equal(els.scene.style.display, 'block');
    assert.equal(els.fallback.style.display, 'none');
  }

  // Shed assertions
  const shed = lastScene.children.find((x) => x.name === 'scaled-shed');
  const s = geometry.shed;
  assert(shed, '3D shed exists');
  const wall = shed.children.find((x) => x.name === 'shed-walls');
  assert.equal(wall.geometry.parameters.width, 12);
  assert.equal(wall.geometry.parameters.depth, 8);
  assert.equal(wall.geometry.parameters.height, 7);

  const roofs = shed.children.filter((x) => x.name.startsWith('shed-roof-'));
  assert.equal(roofs.length, 2);
  const all = roofs.flatMap((x) => Array.from(x.geometry.attributes.position.array));
  const axis = (n) => all.filter((_, i) => i % 3 === n);
  assert.equal(Math.max(...axis(0)) - Math.min(...axis(0)), 13);
  assert.equal(Math.max(...axis(2)) - Math.min(...axis(2)), 9);
  assert(Math.abs(Math.max(...axis(1)) - s.ridge_height_ft) < 1e-5);
  assert(Math.abs(Math.min(...axis(1)) - (s.wall_height_ft - (s.overhang_ft * 2) / 3)) < 1e-5);
  assert(Math.abs(Math.hypot(...s.corners[0].map((x, i) => x - s.corners[1][i])) - 12) < 1e-8);
  assert(Math.abs(Math.hypot(...s.corners[1].map((x, i) => x - s.corners[2][i])) - 8) < 1e-8);

  const northWallA = geometry.house[9];
  const northWallB = geometry.house[8];
  const distanceToNorthWall = (q) =>
    Math.abs(
      (northWallB[0] - northWallA[0]) * (northWallA[1] - q[1]) -
        (northWallA[0] - q[0]) * (northWallB[1] - northWallA[1])
    ) / Math.hypot(northWallB[0] - northWallA[0], northWallB[1] - northWallA[1]);
  assert(Math.abs(distanceToNorthWall(s.corners[0]) - 48 / 12) < 1e-8);
  assert(Math.abs(distanceToNorthWall(s.roof_corners[0]) - 42 / 12) < 1e-8);

  for (let i = 0; i < 4; i++) {
    const a = geometry.lot[i];
    const b = geometry.lot[(i + 1) % 4];
    for (const p of s.roof_corners) {
      const side = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      assert(side > 0, 'Roof entirely within survey-fit lot');
    }
  }
  assert(
    s.roof_clearance_ft.north < 5 && s.wall_clearance_ft.north > 5 && s.roof_clearance_ft.east > 5
  );

  // Low-poly house assertions
  const house = lastScene.children.find((x) => x.name === 'low-poly-house');
  assert(house);
  assert.equal(
    house.children.filter((x) => x.name.startsWith('survey-wall-')).length,
    geometry.house.length
  );
  assert.equal(house.children.filter((x) => x.name.startsWith('main-roof-')).length, 2);
  assert.equal(house.children.filter((x) => x.name.startsWith('front-porch-hip-')).length, 3);
  assert.equal(house.children.filter((x) => x.name === 'west-bay-hip').length, 4);
  assert.equal(house.children.filter((x) => x.name === 'window-glass').length, 5);

  let triangles = 0;
  for (const m of house.children) {
    triangles += (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3;
  }
  assert(triangles < 1200);
  assert.equal(triangles, 859);
  assert.equal(shed.children.filter((x) => x.name === 'shed-double-door').length, 1);
  assert.equal(shed.children.filter((x) => x.name === 'shed-side-door').length, 1);

  // Street centerlines and curbs
  const centerlines = lastScene.children.filter((x) => x.name === 'street-centerline');
  assert.equal(centerlines.length, 2);
  assert.equal(
    centerlines[1].geometry.attributes.position.getZ(0),
    0,
    'Paine centerline ends at Oakwood, no south extension'
  );
  assert.equal(lastScene.children.filter((x) => x.name === 'street-curb').length, 5);

  // Hipped porch roof planes & continuous x+y=110.6 hip
  const porchPlanes = ['west', 'north'].map((n) =>
    house.children.find((x) => x.name === `hipped-${n}-porch-roof`)
  );
  assert(porchPlanes.every(Boolean));
  const hipVertices = [];
  for (const [k, mesh] of porchPlanes.entries()) {
    const pa = mesh.geometry.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i);
      const y = -pa.getZ(i);
      const z = pa.getY(i);
      const west = 8 + (x - 25.9) * 0.12;
      const north = 8 + (84.7 - y) * 0.12;
      assert(Math.abs(z - (k === 0 ? west : north)) < 1e-5);
      assert(Math.abs(z - Math.min(west, north)) < 1e-5);
      if (Math.abs(x + y - 110.6) < 1e-5) hipVertices.push([x, y, z]);
    }
  }
  assert(hipVertices.length >= 4);
  assert(Math.abs(hipVertices[0][2] - (8 + (hipVertices[0][0] - 25.9) * 0.12)) < 1e-5);

  // Compass projection and 2D reset
  assert(els['compass-needle'].style.transform.startsWith('rotate('));
  els.button.onclick();
  assert.equal(els['compass-needle'].style.transform, 'rotate(0deg)');
  els.button.onclick();

  const cx =
    (Math.min(...geometry.house.map((p) => p[0])) + Math.max(...geometry.house.map((p) => p[0]))) /
    2;
  const cy =
    (Math.min(...geometry.house.map((p) => p[1])) + Math.max(...geometry.house.map((p) => p[1]))) /
    2;
  for (const [dx, dz, expected] of [
    [0, 80, 0],
    [80, 0, 90],
    [0, -80, 180],
    [-80, 0, -90],
  ]) {
    lastCamera.position.set(cx + dx, 55, -cy + dz);
    lastCamera.lookAt(cx, 7, -cy);
    lastCamera.updateMatrixWorld();
    viewer.update({ values: defaults, estimate: calculate(defaults) });
    const actual = parseFloat(els['compass-needle'].style.transform.slice(7));
    assert(
      Math.abs(((actual - expected + 540) % 360) - 180) < 1e-6,
      `Compass cardinal ${expected}`
    );
  }

  // No 3D shed label
  assert(
    !lastScene.children.some(
      (m) => m.material?.map?.isCanvasTexture && !m.name.startsWith('street-text-')
    ),
    'No 3D building or shed text label'
  );

  // 2D +/- zoom and reset
  els.button.onclick();
  els.zoomIn.onclick();
  assert(Math.abs(Number(els.fallback.viewBox.split(' ')[2]) - 336) < 1e-6);
  els.zoomOut.onclick();
  assert.equal(Number(els.fallback.viewBox.split(' ')[2]), 420);
  els.zoomIn.onclick();
  els.fit.onclick();
  assert.equal(els.fallback.viewBox, '0 0 420 410');
  els.button.onclick();

  // Front porch 45-degree hips and no rear slope
  for (const name of ['east', 'west']) {
    const pos = house.children.find((m) => m.name === `front-porch-hip-${name}`).geometry.attributes
      .position;
    const high = [pos.getX(2), -pos.getZ(2)];
    const low = name === 'east' ? [pos.getX(0), -pos.getZ(0)] : [pos.getX(1), -pos.getZ(1)];
    assert(Math.abs(Math.abs(high[0] - low[0]) - Math.abs(high[1] - low[1])) < 1e-5);
  }
  assert(!house.children.some((m) => m.name === 'front-porch-hip-back'));

  // Roof seams, north enclosure walls, and upper-house closures
  const porchHeight = (x, y) => Math.min(8 + (x - 25.9) * 0.12, 8 + (84.7 - y) * 0.12);
  const near = (a, b) => Math.abs(a - b) < 2e-5;
  const meshTriangles = (mesh) => {
    const p = mesh.geometry.attributes.position;
    const ix = mesh.geometry.index;
    const faces = [];
    for (let i = 0; i < (ix?.count ?? p.count); i += 3) {
      faces.push(
        [0, 1, 2].map((j) => {
          const k = ix ? ix.getX(i + j) : i + j;
          return [p.getX(k), -p.getZ(k), p.getY(k)];
        })
      );
    }
    return faces;
  };
  const porchTriangles = porchPlanes.flatMap(meshTriangles);
  function roofAt(x, y) {
    for (const [a, b, c] of porchTriangles) {
      const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (Math.abs(den) < 1e-9) continue;
      const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den;
      const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den;
      const w = 1 - u - v;
      if (Math.min(u, v, w) > -1e-5) return u * a[2] + v * b[2] + w * c[2];
    }
    return null;
  }

  for (let i = 0; i < geometry.house.length; i++) {
    const wallMesh = house.children.find((m) => m.name === `survey-wall-${i}`);
    const a = geometry.house[i];
    const b = geometry.house[(i + 1) % geometry.house.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    const faces = meshTriangles(wallMesh);
    for (const p of faces.flat()) {
      assert(
        Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / length < 1e-5,
        `Survey wall remains on original footprint ${i}`
      );
      assert(p[2] >= 0);
      if ((i < 6 || i > 12) && p[2] > 0) {
        assert.equal(p[2], 9, 'Unrelated wall height stays unchanged');
      }
    }
    for (const p of [a, b]) {
      assert(
        faces.flat().some((q) => near(q[0], p[0]) && near(q[1], p[1]) && q[2] === 0),
        `Survey wall endpoint retained ${i}`
      );
    }
    if (i >= 7 && i <= 12) {
      for (const p of faces.flat().filter((pt) => pt[2] > 0)) {
        assert(
          near(p[2], porchHeight(p[0], p[1])),
          `North enclosure/attachment wall ends at roof ${i}`
        );
        assert(
          near(p[2], roofAt(p[0], p[1])),
          `Wall top has an actual roof triangle above it ${i}`
        );
      }
      for (const face of faces) {
        const top = face.filter((pt) => pt[2] > 0);
        if (top.length === 2) {
          for (const t of [0.25, 0.5, 0.75]) {
            const p = top[0].map((v, j) => v + (top[1][j] - v) * t);
            assert(
              near(p[2], roofAt(p[0], p[1])),
              `Whole wall-to-roof seam is closed, including hip ${i}`
            );
          }
        }
      }
    }
  }

  const closures = house.children.filter((m) => m.name.startsWith('porch-house-closure-'));
  assert.equal(closures.length, 3);
  for (const mesh of closures) {
    const faces = meshTriangles(mesh);
    for (const p of faces.flat()) {
      assert(
        near(p[2], 9) || near(p[2], porchHeight(p[0], p[1])),
        'Closure bridges roof to upper-house base'
      );
    }
    for (const face of faces) {
      const bottom = face.filter((p) => !near(p[2], 9));
      if (bottom.length === 2) {
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const p = bottom[0].map((v, j) => v + (bottom[1][j] - v) * t);
          assert(near(p[2], roofAt(p[0], p[1])), 'House attachment has no uncovered roof seam');
        }
      }
    }
  }

  const hipSeams = porchPlanes.map((mesh) => {
    const segments = [];
    for (const face of meshTriangles(mesh)) {
      for (let i = 0; i < 3; i++) {
        const a = face[i];
        const b = face[(i + 1) % 3];
        if (near(a[0] + a[1], 110.6) && near(b[0] + b[1], 110.6)) {
          segments.push([a, b].sort((p, q) => p[0] - q[0]));
        }
      }
    }
    return segments.sort((a, b) => a[0][0] - b[0][0]);
  });
  assert.equal(hipSeams[0].length, hipSeams[1].length);
  assert(hipSeams[0].length > 0);
  for (let i = 0; i < hipSeams[0].length; i++) {
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < 3; k++) {
        assert(
          near(hipSeams[0][i][j][k], hipSeams[1][i][j][k]),
          'Both roof faces share exactly the same hip seam'
        );
      }
    }
  }

  // Street text planes and orientation across 4 quadrants and 3 aspect ratios
  const roadTextMeshes = lastScene.children.filter((m) => m.name.startsWith('street-text-'));
  assert.equal(roadTextMeshes.length, 2);
  for (const m of roadTextMeshes) {
    assert(m.material.depthTest);
    assert(!m.material.depthWrite);
    assert(m.material.opacity < 1);
    assert.equal(m.rotation.x, -Math.PI / 2);
    assert.equal(m.position.y, 0.025);
    assert.equal(m.geometry.parameters.width, 25);
  }
  assert(roadTextMeshes[0].position.x < 0);
  assert(roadTextMeshes[1].position.z > 0);
  assert.equal(els['road-labels'].style.display, 'none');

  for (const width of [320, 390, 900]) {
    lastCamera.aspect = width / 340;
    lastCamera.updateProjectionMatrix();
    for (const [dx, dz] of [
      [-80, 80],
      [80, 80],
      [80, -80],
      [-80, -80],
    ]) {
      lastCamera.position.set(cx + dx, 65, -cy + dz);
      lastCamera.lookAt(cx, 7, -cy);
      lastCamera.updateMatrixWorld();
      viewer.update({ values: defaults, estimate: calculate(defaults) });
      for (const mesh of roadTextMeshes) {
        mesh.updateMatrixWorld();
        const a = mesh.position.clone().project(lastCamera);
        const b = new THREE.Vector3(1, 0, 0).applyMatrix4(mesh.matrixWorld).project(lastCamera);
        assert(b.x >= a.x - 1e-8, 'Street reading direction remains left-to-right while orbiting');
        assert(Number.isFinite(a.x) && Number.isFinite(a.y));
      }
    }
  }

  // Building visibility cycling (Normal -> Ghost -> Footprint) and material isolation
  const buildingParts = [...house.children, ...shed.children].filter((x) => x.isMesh);
  const normalMats = buildingParts.map((x) => x.material);
  const normalGround = polygonMeshes.map((x) => x.material);

  for (let i = 0; i < 3; i++) {
    els['building-cycle'].onclick();
    buildingParts.forEach((x, j) => {
      assert(x.visible);
      assert.notEqual(x.material, normalMats[j]);
      assert.equal(x.material.opacity, 0.14);
      assert(x.material.transparent);
      assert(!x.material.depthWrite);
      assert(x.material.depthTest);
    });
    els.button.onclick();
    assert(els['building-cycle'].disabled);
    els.button.onclick();
    assert(!els['building-cycle'].disabled);
    assert.equal(buildingParts[0].material.opacity, 0.14);
    els['building-cycle'].onclick();
    assert(buildingParts.every((x) => !x.visible));
    assert(polygonMeshes.every((x) => x.visible));
    els['building-cycle'].onclick();
    buildingParts.forEach((x, j) => {
      assert(x.visible);
      assert.equal(x.material, normalMats[j]);
    });
  }
  polygonMeshes.forEach((x, j) => assert.equal(x.material, normalGround[j]));
  assert(viewer.getState().fenceGroup.children.every((x) => x.visible && !x.material.transparent));

  assert.equal(els['building-cycle'].textContent, 'Buildings: Normal ↻');
  for (const [current, next] of [
    ['Ghost', 'Footprint'],
    ['Footprint', 'Normal'],
    ['Normal', 'Ghost'],
  ]) {
    els['building-cycle'].onclick();
    assert.equal(els['building-cycle'].textContent, `Buildings: ${current} ↻`);
    assert.equal(els['building-cycle']['aria-label'], `House and shed: ${current}. Next: ${next}.`);
  }

  // Pairwise non-overlapping road and sidewalk regions, elevations, and camera near plane
  const roads = lastScene.children.filter((x) => x.name === 'road-surface');
  const walks = lastScene.children.filter((x) => x.name === 'sidewalk-surface');
  assert.equal(roads.length, 8);
  assert.equal(walks.length, 5);
  assert.equal(lastCamera.near, 1);
  assert(roads.every((x) => x.position.y === -0.25));
  assert(walks.every((x) => x.position.y === -0.015));

  function overlaps(a, b) {
    for (const poly of [a, b]) {
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % poly.length];
        const n = [-(q[1] - p[1]), q[0] - p[0]];
        const aa = a.map((v) => v[0] * n[0] + v[1] * n[1]);
        const bb = b.map((v) => v[0] * n[0] + v[1] * n[1]);
        if (
          Math.max(...aa) <= Math.min(...bb) + 1e-5 ||
          Math.max(...bb) <= Math.min(...aa) + 1e-5
        ) {
          return false;
        }
      }
    }
    return true;
  }

  const paving = [...roads, ...walks];
  for (let i = 0; i < paving.length; i++) {
    for (let j = i + 1; j < paving.length; j++) {
      assert(
        !overlaps(paving[i].userData.plan, paving[j].userData.plan),
        `Paving areas must not overlap: ${i},${j}`
      );
    }
  }
  for (const curb of lastScene.children.filter((x) => x.name === 'street-curb')) {
    assert(Math.abs(curb.geometry.attributes.position.getY(0) - 0.025) < 1e-6);
  }

  // Teardown disposes resources cleanly
  viewer.destroy();
  assert(disposed, 'Renderer disposed on viewer teardown');
});

test('viewer falls back to usable 2D SVG plan when WebGL initialization fails', async () => {
  const { els, doc } = createViewerTestDom();
  const viewer = createViewer({
    doc,
    geometry,
    initialState: { values: defaults, estimate: calculate(defaults) },
    createRenderer: () => {
      throw new Error('Simulated WebGL context failure');
    },
  });

  await viewer.ready;
  assert.equal(viewer.getState().mode, '2d');
  assert(els.viewstatus.textContent.includes('2D plan'));
  assert.equal(els.scene.style.display, 'none');
  assert.equal(els.fallback.style.display, 'block');
  assert(els.button.disabled);
  assert(els.fallback.innerHTML.includes('<polygon'));
  viewer.destroy();
});
