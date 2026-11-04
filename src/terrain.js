/**
 * Site terrain/elevation sampling, satellite imagery registration, and parameterized
 * fence-run geometry resolution.
 *
 * Supports:
 * - Flat lots (`{ mode: 'flat', baseElevationFt: 0 }`)
 * - Sloped planes (`{ mode: 'slope', origin: [x0, y0], baseElevationFt, gradeX, gradeY }`)
 * - Sampled 2D elevation grids / DEMs (`{ mode: 'grid', bounds: { minX, maxX, minY, maxY }, cols, rows, heights }`)
 * - Custom property polygons and parameterized fence run vectors/origins
 */

export const DEFAULT_SKEW_ANGLE_RAD = (56 / 60) * (Math.PI / 180);

/**
 * @typedef {Object} ElevationConfig
 * @property {'flat' | 'slope' | 'grid'} [mode='flat']
 * @property {number} [baseElevationFt=0]
 * @property {[number, number]} [origin=[0, 0]]
 * @property {number} [gradeX=0] Elevation change in feet per foot along +X (east)
 * @property {number} [gradeY=0] Elevation change in feet per foot along +Y (north)
 * @property {{ minX: number, maxX: number, minY: number, maxY: number }} [bounds]
 * @property {number} [cols]
 * @property {number} [rows]
 * @property {number[]} [heights] Row-major elevation samples in feet (length = rows * cols)
 */

/**
 * @typedef {Object} SatelliteImageryConfig
 * @property {string} url URL or data URI of the overhead satellite/aerial image
 * @property {{ minX: number, maxX: number, minY: number, maxY: number }} bounds Plan bounds in feet
 * @property {number} [opacity=1] Opacity (0 to 1)
 * @property {number} [elevationFt=-0.005] 3D plane Y elevation in feet
 * @property {number} [rotationRad=0] Optional plan rotation in radians
 */

/**
 * Creates a function `(x, y) => elevationFt` from an elevation configuration object.
 * Defaults to a flat 0 ft datum when omitted.
 *
 * @param {ElevationConfig | null | undefined} elevationConfig
 * @returns {(x: number, y: number) => number}
 */
export function createElevationSampler(elevationConfig) {
  if (!elevationConfig || elevationConfig.mode === 'flat') {
    const base = Number(elevationConfig?.baseElevationFt) || 0;
    return () => base;
  }

  if (elevationConfig.mode === 'slope') {
    const base = Number(elevationConfig.baseElevationFt) || 0;
    const [ox, oy] = elevationConfig.origin || [0, 0];
    const gx = Number(elevationConfig.gradeX) || 0;
    const gy = Number(elevationConfig.gradeY) || 0;
    return (x, y) => base + (x - ox) * gx + (y - oy) * gy;
  }

  if (
    elevationConfig.mode === 'grid' &&
    elevationConfig.bounds &&
    elevationConfig.cols >= 2 &&
    elevationConfig.rows >= 2 &&
    Array.isArray(elevationConfig.heights)
  ) {
    const { minX, maxX, minY, maxY } = elevationConfig.bounds;
    const { cols, rows, heights } = elevationConfig;
    const spanX = Math.max(1e-9, maxX - minX);
    const spanY = Math.max(1e-9, maxY - minY);

    const sampleAtGrid = (col, row) => {
      const c = Math.max(0, Math.min(cols - 1, col));
      const r = Math.max(0, Math.min(rows - 1, row));
      return Number(heights[r * cols + c]) || 0;
    };

    return (x, y) => {
      const u = Math.max(0, Math.min(1, (x - minX) / spanX)) * (cols - 1);
      const v = Math.max(0, Math.min(1, (y - minY) / spanY)) * (rows - 1);
      const c0 = Math.floor(u);
      const r0 = Math.floor(v);
      const tx = u - c0;
      const ty = v - r0;

      const h00 = sampleAtGrid(c0, r0);
      const h10 = sampleAtGrid(c0 + 1, r0);
      const h01 = sampleAtGrid(c0, r0 + 1);
      const h11 = sampleAtGrid(c0 + 1, r0 + 1);

      const bottom = h00 + (h10 - h00) * tx;
      const top = h01 + (h11 - h01) * tx;
      return bottom + (top - bottom) * ty;
    };
  }

  return () => 0;
}

/**
 * Resolves the fence plan geometry (shared corner or per-run origins, unit vectors,
 * 3D rotations, picket face offsets, and max lengths) from a site geometry dataset.
 *
 * @param {Object} geometry Site geometry dataset
 */
export function resolveFencePlanGeometry(geometry) {
  const lot = geometry?.lot || [
    [0, 0],
    [61.5, 0],
    [59.84666454451664, 101.48653350012327],
    [-1.653335455483357, 101.48653350012327],
  ];
  const fp = geometry?.fencePlan || {};
  const cornerIndex = fp.cornerVertexIndex ?? 2;
  const corner = fp.corner || lot[cornerIndex] || lot[0];
  const skewRad =
    fp.skewAngleRad ??
    (fp.skewAngleArcMinutes !== undefined
      ? (fp.skewAngleArcMinutes / 60) * (Math.PI / 180)
      : DEFAULT_SKEW_ANGLE_RAD);

  const defaultEastVector = [Math.sin(skewRad), -Math.cos(skewRad)];
  const defaultNorthVector = [-1, 0];

  const rawRuns = fp.runs || {};
  const eastSpec = rawRuns.east || {};
  const northSpec = rawRuns.north || {};

  const normalizeVec = ([dx, dy]) => {
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  };

  const eastDir = eastSpec.direction ? normalizeVec(eastSpec.direction) : defaultEastVector;
  const northDir = northSpec.direction ? normalizeVec(northSpec.direction) : defaultNorthVector;

  const eastRotationY = eastSpec.rotationY ?? Math.atan2(eastDir[1], eastDir[0]);
  const northRotationY = northSpec.rotationY ?? Math.atan2(northDir[1], northDir[0]);

  const picketOffsetMag = fp.picketOffsetFt ?? 0.22;

  const runs = {
    east: {
      key: 'east',
      name: eastSpec.name || 'East',
      origin: eastSpec.origin || corner,
      direction: eastDir,
      maxLength: eastSpec.maxLength ?? 101.5,
      defaultLength: eastSpec.defaultLength ?? 81.5,
      defaultMode: eastSpec.defaultMode ?? '6',
      defaultTransition: eastSpec.defaultTransition ?? 40,
      uiDirection: eastSpec.uiDirection || 'ltr',
      rotationY: eastRotationY,
      picketOffset3D: eastSpec.picketOffset3D || [
        -picketOffsetMag * eastDir[1],
        -picketOffsetMag * eastDir[0],
      ],
    },
    north: {
      key: 'north',
      name: northSpec.name || 'North',
      origin: northSpec.origin || corner,
      direction: northDir,
      maxLength: northSpec.maxLength ?? 61.5,
      defaultLength: northSpec.defaultLength ?? 41.5,
      defaultMode: northSpec.defaultMode ?? '6',
      defaultTransition: northSpec.defaultTransition ?? 20,
      uiDirection: northSpec.uiDirection || 'rtl',
      rotationY: northRotationY,
      picketOffset3D: northSpec.picketOffset3D || [
        picketOffsetMag * northDir[1],
        picketOffsetMag * northDir[0],
      ],
    },
  };

  return {
    corner,
    skewRad,
    runs,
    pointAt(runKey, distanceFt) {
      const r = runs[runKey];
      if (!r) {
        return [corner[0] - distanceFt, corner[1]];
      }
      return [r.origin[0] + r.direction[0] * distanceFt, r.origin[1] + r.direction[1] * distanceFt];
    },
  };
}
