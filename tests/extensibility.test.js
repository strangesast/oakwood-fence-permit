import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate, defaults } from '../src/calc.js';
import { buildPlanSvgMarkup } from '../src/plan.js';
import {
  addBuildingsToScene,
  addSiteToScene,
  applyBuildingVisibilityMode,
  createElevationSampler,
  rebuildFenceMeshes,
  resolveFencePlanGeometry,
  THREE,
} from '../src/scene/index.js';

test('elevation sampler supports flat, sloped plane, and 2D bilinear grid DEM data', () => {
  const flat = createElevationSampler({ mode: 'flat', baseElevationFt: 2.5 });
  assert.equal(flat(10, 20), 2.5);

  const sloped = createElevationSampler({
    mode: 'slope',
    baseElevationFt: 10,
    origin: [0, 0],
    gradeX: 0.05,
    gradeY: 0.1,
  });
  assert(Math.abs(sloped(20, 30) - (10 + 1 + 3)) < 1e-9);

  // 2x2 grid over [0..100] x [0..100]: corners at 0, 10, 20, 30 ft
  const grid = createElevationSampler({
    mode: 'grid',
    bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 },
    cols: 2,
    rows: 2,
    heights: [0, 10, 20, 30],
  });
  assert(Math.abs(grid(0, 0) - 0) < 1e-9);
  assert(Math.abs(grid(100, 0) - 10) < 1e-9);
  assert(Math.abs(grid(0, 100) - 20) < 1e-9);
  assert(Math.abs(grid(100, 100) - 30) < 1e-9);
  assert(Math.abs(grid(50, 50) - 15) < 1e-9);
});

test('custom property polygon, custom fence plan vectors/limits, custom house massing, elevation, and satellite imagery', () => {
  const customSite = {
    lot: [
      [0, 0],
      [80, 0],
      [90, 60],
      [75, 130],
      [0, 120],
    ],
    fencePlan: {
      corner: [75, 130],
      runs: {
        east: {
          key: 'east',
          name: 'East',
          maxLength: 140,
          defaultLength: 120,
          defaultMode: '6',
          defaultTransition: 60,
          direction: [0, -1],
          uiDirection: 'ltr',
        },
        north: {
          key: 'north',
          name: 'North',
          maxLength: 90,
          defaultLength: 75,
          defaultMode: 'split',
          defaultTransition: 50,
          direction: [-1, 0],
          uiDirection: 'rtl',
        },
      },
    },
    elevation: {
      mode: 'slope',
      baseElevationFt: 0,
      origin: [0, 0],
      gradeX: 0.02,
      gradeY: 0.04,
    },
    imagery: {
      url: '/oakwood-fence-permit/satellite-ortho.png',
      bounds: { minX: -20, maxX: 100, minY: -20, maxY: 140 },
      opacity: 0.8,
      elevationFt: -0.01,
    },
    streets: false,
    house: [
      [15, 25],
      [55, 25],
      [55, 50],
      [35, 50],
      [35, 70],
      [15, 70],
    ],
    porches: [
      [
        [20, 18],
        [45, 18],
        [45, 25],
        [20, 25],
      ],
    ],
    houseModel: {
      wallHeightFt: 11,
      gables: [
        {
          name: 'custom-main',
          x0: 15,
          x1: 55,
          y0: 25,
          y1: 50,
          eave: 11,
          ridge: 17,
          overhang: 0.5,
        },
      ],
    },
    shed: null,
  };

  const fp = resolveFencePlanGeometry(customSite);
  assert.deepEqual(fp.pointAt('east', 30), [75, 100]);
  assert.deepEqual(fp.pointAt('north', 25), [50, 130]);

  const runLimits = {
    east: fp.runs.east.maxLength,
    north: fp.runs.north.maxLength,
  };

  // Lengths exceeding Oakwood's 101.5 / 61.5 ft are valid under the custom 140 / 90 ft property limits
  const values = { ...defaults, east: 120, north: 75, nm: 'split', nt: 50 };
  const estimate = calculate(values, { runLimits });
  assert.equal(estimate.errors.length, 0);
  assert.equal(estimate.total, 195);

  const overLimit = calculate({ ...values, east: 145 }, { runLimits });
  assert.equal(overLimit.errors.length, 1);
  assert(overLimit.errors[0].includes('140 ft'));

  // 2D SVG plan renders satellite imagery <image> and custom lot/house polygons
  const svg = buildPlanSvgMarkup(customSite, estimate);
  assert(svg.includes('<image href="/oakwood-fence-permit/satellite-ortho.png"'));
  assert(svg.includes('opacity="0.8"'));

  // 3D scene builds satellite imagery plane, sloped terrain, custom 6-wall house, and elevated fence posts
  const scene = new THREE.Scene();
  const siteResult = addSiteToScene({ THREE, scene, geometry: customSite });
  const satMesh = scene.children.find((m) => m.name === 'satellite-imagery');
  assert(satMesh, 'Satellite imagery plane added to 3D scene');
  assert.equal(satMesh.geometry.parameters.width, 120);
  assert.equal(satMesh.geometry.parameters.height, 160);
  assert.equal(satMesh.material.opacity, 0.8);

  const buildingsResult = addBuildingsToScene({ THREE, scene, geometry: customSite });
  assert.equal(
    buildingsResult.house.children.filter((m) => m.name.startsWith('survey-wall-')).length,
    6,
    'Custom 6-vertex house footprint produces 6 wall meshes'
  );
  assert.equal(
    buildingsResult.house.children.filter((m) => m.name.startsWith('custom-main-roof-')).length,
    2,
    'Custom gable spec produces roof planes'
  );
  assert.equal(buildingsResult.shed.children.length, 0, 'Null shed skips shed meshes');

  applyBuildingVisibilityMode(buildingsResult.buildingMeshes, 'ghost');
  assert(buildingsResult.buildingMeshes.every((m) => m.material.opacity === 0.14));

  const fenceGroup = new THREE.Group();
  const fenceMaterials = [];
  rebuildFenceMeshes({
    THREE,
    fenceGroup,
    fenceMaterials,
    geometry: customSite,
    values,
    estimate,
  });

  // Corner post at [75, 130] sits on sloped ground: elevation = 75 * 0.02 + 130 * 0.04 = 1.5 + 5.2 = 6.7 ft
  // Corner post height = 6 ft -> center localY = (6 + 0.25) / 2 = 3.125 ft -> world Y = 6.7 + 3.125 = 9.825 ft
  const cornerPostMesh = fenceGroup.children.find(
    (m) =>
      Math.abs(m.position.x - 75) < 1e-6 &&
      Math.abs(m.position.z - -130) < 1e-6 &&
      m.geometry?.parameters?.height > 1
  );
  assert(cornerPostMesh, 'Corner post placed at custom corner [75, 130]');
  assert(
    Math.abs(cornerPostMesh.position.y - (6.7 + 3.125)) < 1e-5,
    'Corner post elevated to match sloped terrain at [75, 130]'
  );

  siteResult.disposeSite();
  buildingsResult.disposeBuildings();
});
