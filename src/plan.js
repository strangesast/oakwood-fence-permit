import { DEFAULT_SKEW_ANGLE_RAD, resolveFencePlanGeometry } from './terrain.js';

/**
 * 2D SVG plan rendering and survey-coordinate helpers.
 * Supports custom property shapes, parameterized fence plans, and optional satellite imagery overlays.
 */

export const LOT_SKEW_ANGLE_RAD = DEFAULT_SKEW_ANGLE_RAD;

const EAST_UX = Math.sin(LOT_SKEW_ANGLE_RAD);
const EAST_UY = -Math.cos(LOT_SKEW_ANGLE_RAD);

/**
 * Computes the [x, y] plan coordinates (in feet) of a point at `distanceFt` from the
 * corner along either the 'east' or 'north' boundary.
 *
 * @param {[number, number]} cornerPoint Northeast corner [x, y] in feet
 * @param {'east' | 'north'} runKey
 * @param {number} distanceFt Distance from the NE corner in feet
 * @returns {[number, number]}
 */
export function getRunPointAtDistance(cornerPoint, runKey, distanceFt) {
  if (runKey === 'east') {
    return [cornerPoint[0] + EAST_UX * distanceFt, cornerPoint[1] + EAST_UY * distanceFt];
  }
  return [cornerPoint[0] - distanceFt, cornerPoint[1]];
}

/**
 * Computes the bounding-box center [x, y] of a footprint polygon in feet.
 * @param {Array<[number, number]>} polygon
 * @returns {[number, number]}
 */
export function getHouseCenter(polygon) {
  if (!polygon || polygon.length === 0) return [0, 0];
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/**
 * Projects a plan coordinate [x, y] in feet onto the SVG canvas coordinate space.
 * @param {[number, number]} pointFt
 * @param {{ origin?: [number, number], scale?: number }} [planView]
 * @returns {[number, number]}
 */
export function projectToPlanSvg(pointFt, planView) {
  const [ox, oy] = planView?.origin || [100, 310];
  const scale = planView?.scale ?? 2.55;
  return [ox + pointFt[0] * scale, oy - pointFt[1] * scale];
}

/**
 * Computes the SVG viewBox string for a given center and zoom factor.
 * @param {[number, number]} planCenter
 * @param {number} planZoom
 * @param {{ width?: number, height?: number }} [planView]
 * @returns {string}
 */
export function computePlanViewBox(planCenter, planZoom, planView) {
  const baseWidth = planView?.width ?? 420;
  const baseHeight = planView?.height ?? 410;
  const width = baseWidth / planZoom;
  const height = baseHeight / planZoom;
  return `${planCenter[0] - width / 2} ${planCenter[1] - height / 2} ${width} ${height}`;
}

/**
 * Builds the inner SVG markup for the 2D survey plan, optional satellite imagery,
 * and active fence segments/posts. Pure function with no DOM access.
 *
 * @param {Object} geometry Site geometry dataset
 * @param {ReturnType<import('./calc.js').calculate>} estimate Valid calculation result
 * @returns {string}
 */
export function buildPlanSvgMarkup(geometry, estimate) {
  const planView = geometry.planView;
  const fencePlan = resolveFencePlanGeometry(geometry);
  const corner = fencePlan.corner;
  const wx = (y) => -y * Math.tan(fencePlan.skewRad);
  const ptToSvg = (pt) => projectToPlanSvg(pt, planView);

  const polygonMarkup = (points, fill, stroke) =>
    `<polygon points="${points.map((p) => ptToSvg(p).join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`;
  const roadLineMarkup = (points) =>
    `<polyline points="${points.map((p) => ptToSvg(p).join(',')).join(' ')}" fill="none" stroke="#b8b8a4" stroke-width="1" stroke-dasharray="7 6"/>`;

  let svg = '';

  // Optional georeferenced satellite/aerial imagery layer
  if (geometry.imagery?.url && geometry.imagery?.bounds) {
    const { minX, maxX, minY, maxY } = geometry.imagery.bounds;
    const topLeft = ptToSvg([minX, maxY]);
    const bottomRight = ptToSvg([maxX, minY]);
    const imgWidth = Math.abs(bottomRight[0] - topLeft[0]);
    const imgHeight = Math.abs(bottomRight[1] - topLeft[1]);
    const opacity = geometry.imagery.opacity ?? 0.85;
    svg += `<image href="${geometry.imagery.url}" x="${topLeft[0]}" y="${topLeft[1]}" width="${imgWidth}" height="${imgHeight}" opacity="${opacity}" preserveAspectRatio="none"/>`;
  }

  if (geometry.streets !== false) {
    svg +=
      polygonMarkup(
        [
          [-100, -66],
          [150, -66],
          [150, 0],
          [-100, 0],
        ],
        '#f1f0e9',
        '#e0e2d9'
      ) +
      polygonMarkup(
        [
          [-49.5, 0],
          [0, 0],
          [wx(200), 200],
          [wx(200) - 49.5, 200],
        ],
        '#f1f0e9',
        '#e0e2d9'
      ) +
      polygonMarkup(
        [
          [0, -6],
          [150, -6],
          [150, -2],
          [0, -2],
        ],
        '#dedfd6',
        '#d1d5ca'
      ) +
      polygonMarkup(
        [
          [-100, -6],
          [-49.5, -6],
          [-49.5, -2],
          [-100, -2],
        ],
        '#dedfd6',
        '#d1d5ca'
      ) +
      polygonMarkup(
        [
          [-100, -64],
          [150, -64],
          [150, -60],
          [-100, -60],
        ],
        '#dedfd6',
        '#d1d5ca'
      ) +
      polygonMarkup(
        [
          [-47.5, 0],
          [-43.5, 0],
          [wx(200) - 43.5, 200],
          [wx(200) - 47.5, 200],
        ],
        '#dedfd6',
        '#d1d5ca'
      ) +
      polygonMarkup(
        [
          [-6, 0],
          [-2, 0],
          [wx(200) - 2, 200],
          [wx(200) - 6, 200],
        ],
        '#dedfd6',
        '#d1d5ca'
      );
  }

  if (geometry.lot?.length) {
    svg += polygonMarkup(geometry.lot, '#edf1e6', '#a2b297');
  }
  if (geometry.porches?.length) {
    svg += geometry.porches.map((porch) => polygonMarkup(porch, '#abb7ad', '#7c8e82')).join('');
  }
  if (geometry.house?.length) {
    svg += polygonMarkup(geometry.house, '#586c6c', '#405756');
  }
  if (geometry.shed?.roof_corners?.length) {
    svg += polygonMarkup(geometry.shed.roof_corners, '#d7dfd8', '#7c8e82');
  }
  if (geometry.shed?.corners?.length) {
    svg += polygonMarkup(geometry.shed.corners, '#586c6c', '#405756');
  }

  for (const run of estimate.runs) {
    for (const seg of run.segments) {
      const startPt = ptToSvg(fencePlan.pointAt(run.key, seg.start));
      const endPt = ptToSvg(fencePlan.pointAt(run.key, seg.start + seg.length));
      const stroke = seg.height === 6 ? '#b6986d' : '#dccbaa';
      svg += `<line x1="${startPt[0]}" y1="${startPt[1]}" x2="${endPt[0]}" y2="${endPt[1]}" stroke="${stroke}" stroke-width="7"/>`;
    }

    for (const post of run.posts) {
      const postPt = ptToSvg(fencePlan.pointAt(run.key, post.distance));
      svg += `<rect x="${postPt[0] - 3}" y="${postPt[1] - 3}" width="6" height="6" fill="#24372d"/>`;
      if (post.isTransition) {
        svg += `<circle cx="${postPt[0]}" cy="${postPt[1]}" r="9" fill="none" stroke="#b06b26" stroke-width="2"/>`;
      }
    }
  }

  if (estimate.posts > 0) {
    const cornerPt = ptToSvg(corner);
    svg += `<rect x="${cornerPt[0] - 4}" y="${cornerPt[1] - 4}" width="8" height="8" fill="#24372d"/>`;
  }

  const labels = planView?.labels || [
    { text: 'OAKWOOD · SOUTH', x: 145, y: 370, fontSize: 12 },
    { text: 'PAINE · WEST', x: 42, y: 205, fontSize: 12, rotate: -90 },
    { text: 'SW', x: 76, y: 326, fontSize: 11 },
    { text: 'NE corner', x: 265, y: 50, fontSize: 11 },
  ];

  for (const lbl of labels) {
    const transformAttr =
      lbl.rotate !== undefined ? ` transform="rotate(${lbl.rotate} ${lbl.x} ${lbl.y})"` : '';
    svg += `<text x="${lbl.x}" y="${lbl.y}"${transformAttr} font-size="${lbl.fontSize || 11}" fill="#697b6b">${lbl.text}</text>`;
  }

  if (geometry.streets !== false) {
    svg +=
      roadLineMarkup([
        [-100, -33],
        [150, -33],
      ]) +
      roadLineMarkup([
        [-24.75, 0],
        [wx(200) - 24.75, 200],
      ]);
  }

  return svg;
}

/**
 * Updates the fallback SVG element and resets the compass needle to north-up (0deg).
 *
 * @param {SVGElement} fallbackEl
 * @param {Element | null} compassNeedleEl
 * @param {Object} geometry
 * @param {ReturnType<import('./calc.js').calculate>} estimate
 * @param {[number, number]} planCenter
 * @param {number} planZoom
 */
export function renderPlanSvg(
  fallbackEl,
  compassNeedleEl,
  geometry,
  estimate,
  planCenter,
  planZoom
) {
  fallbackEl.setAttribute('viewBox', computePlanViewBox(planCenter, planZoom, geometry?.planView));
  if (compassNeedleEl) {
    compassNeedleEl.style.transform = 'rotate(0deg)';
  }
  fallbackEl.innerHTML = buildPlanSvgMarkup(geometry, estimate);
}
