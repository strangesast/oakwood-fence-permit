import { DEFAULT_INPUTS, RUN_MAX_FT } from './run-state.js';

/**
 * Default input parameters for fence calculation.
 */
export const defaults = { ...DEFAULT_INPUTS };

/**
 * Rounds a quantity up to the next whole integer, tolerating small floating-point imprecision.
 * @param {number} value
 * @returns {number}
 */
export function roundUp(value) {
  return Math.max(0, Math.ceil(value - 1e-9));
}

const NUMERIC_KEYS = Object.keys(defaults).filter((key) => key !== 'em' && key !== 'nm');
const NON_NEGATIVE_KEYS = ['east', 'north', 'gap', 'gravel', 'waste', 'et', 'nt'];
const POSITIVE_KEYS = ['spacing', 'width', 'diameter', 'depth', 'post', 'yield'];
const VALID_MODES = ['6', '4', 'split'];

/**
 * Validates raw settings and computes the complete fence geometry and bill of materials.
 * Pure function with no DOM or Three.js dependencies.
 * Accepts optional `options.runLimits` to support different property boundary lengths.
 *
 * @param {Partial<typeof defaults>} [raw]
 * @param {{ runLimits?: { east: number, north: number } }} [options]
 */
export function calculate(raw = {}, options = {}) {
  const runLimits = options.runLimits || RUN_MAX_FT;
  const v = { ...defaults, ...raw };
  const errors = [];

  for (const key of NUMERIC_KEYS) {
    if (!Number.isFinite(v[key])) {
      errors.push('Enter a number for every setting.');
    }
  }

  for (const key of NON_NEGATIVE_KEYS) {
    if (v[key] < 0) {
      errors.push('Lengths, transition distances, gaps, gravel and waste cannot be negative.');
    }
  }

  for (const key of POSITIVE_KEYS) {
    if (v[key] <= 0) {
      errors.push('Spacing, sizes, hole depth and bag yield must be greater than zero.');
    }
  }

  if (v.spacing < 0.5) {
    errors.push('Maximum post spacing must be at least 0.5 ft.');
  }

  if (v.east > runLimits.east || v.north > runLimits.north) {
    errors.push(
      `The east boundary is ${runLimits.east} ft and the north boundary is ${runLimits.north} ft; keep the fence within these lengths.`
    );
  }

  if (!VALID_MODES.includes(v.em) || !VALID_MODES.includes(v.nm)) {
    errors.push('Choose all 6 ft, all 4 ft, or a transition.');
  }

  for (const key of ['rails6', 'rails4']) {
    if (!Number.isInteger(v[key]) || v[key] < 1 || v[key] > 20) {
      errors.push('Rails per bay must be a whole number from 1 to 20.');
    }
  }

  if (v.gravel >= v.depth) {
    errors.push('Gravel must be shallower than the hole.');
  }

  if (v.diameter <= Math.SQRT2 * v.post) {
    errors.push('Hole diameter must exceed the diagonal of the square post.');
  }

  if (v.waste > 100) {
    errors.push('Waste allowance must not exceed 100%.');
  }

  if (errors.length > 0) {
    return { errors: [...new Set(errors)] };
  }

  const wasteFactor = 1 + v.waste / 100;
  const embed = (v.depth - v.gravel) / 12;
  const byPicket = {};
  const byPost = {};
  const byRail = {};

  const addQuantity = (groupMap, stockLength, quantity) => {
    groupMap[stockLength] = (groupMap[stockLength] || 0) + quantity;
  };

  const runs = [
    {
      key: 'east',
      name: 'East',
      length: v.east,
      mode: v.em,
      transition: v.et,
      maxLength: runLimits.east,
    },
    {
      key: 'north',
      name: 'North',
      length: v.north,
      mode: v.nm,
      transition: v.nt,
      maxLength: runLimits.north,
    },
  ].filter((run) => run.length > 0);

  for (const run of runs) {
    run.sixLength =
      run.mode === '6' ? run.length : run.mode === '4' ? 0 : Math.min(run.length, run.transition);

    run.segments = [];
    if (run.sixLength > 0) {
      run.segments.push({ start: 0, length: run.sixLength, height: 6 });
    }
    if (run.sixLength < run.length) {
      run.segments.push({
        start: run.sixLength,
        length: run.length - run.sixLength,
        height: 4,
      });
    }

    run.posts = [];
    run.bays = 0;
    run.pickets = 0;
    run.railPieces = 0;
    run.picketScrews = 0;

    for (let i = 0; i < run.segments.length; i++) {
      const seg = run.segments[i];
      seg.bays = Math.max(1, roundUp(seg.length / v.spacing));
      seg.bayLength = seg.length / seg.bays;
      seg.rails = seg.height === 6 ? v.rails6 : v.rails4;
      seg.pickets = Math.max(1, roundUp((seg.length * 12 + v.gap) / (v.width + v.gap)));
      seg.railPieces = seg.bays * seg.rails;
      seg.railStock = Math.max(2, roundUp(seg.bayLength / 2) * 2);

      addQuantity(byPicket, seg.height, seg.pickets);
      addQuantity(byRail, seg.railStock, seg.railPieces);

      run.bays += seg.bays;
      run.pickets += seg.pickets;
      run.railPieces += seg.railPieces;
      run.picketScrews += seg.pickets * 2 * seg.rails;

      for (let bayIndex = 1; bayIndex <= seg.bays; bayIndex++) {
        const nextSegment = run.segments[i + 1];
        const isTransition = bayIndex === seg.bays && Boolean(nextSegment);
        const height = isTransition ? Math.max(seg.height, nextSegment.height) : seg.height;
        const stock = roundUp((height + embed) / 2) * 2;
        run.posts.push({
          distance: seg.start + bayIndex * seg.bayLength,
          height,
          stock,
          isTransition,
        });
        addQuantity(byPost, stock, 1);
      }
    }
  }

  const cornerHeight = runs.length ? Math.max(...runs.map((run) => run.segments[0].height)) : 0;
  if (cornerHeight > 0) {
    const cornerStock = roundUp((cornerHeight + embed) / 2) * 2;
    addQuantity(byPost, cornerStock, 1);
  }

  const bays = runs.reduce((sum, run) => sum + run.bays, 0);
  const posts = bays + (runs.length ? 1 : 0);
  const holeRadiusFt = v.diameter / 24;
  const postSideFt = v.post / 12;
  const concretePer = (Math.PI * holeRadiusFt ** 2 - postSideFt ** 2) * embed;
  const concrete = concretePer * posts;
  const gravel = posts * Math.PI * holeRadiusFt ** 2 * (v.gravel / 12);

  const toPurchaseGroups = (groupMap) =>
    Object.entries(groupMap)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([length, qty]) => ({
        length: Number(length),
        qty,
        buy: roundUp(qty * wasteFactor),
      }));

  const rawPicketScrews = runs.reduce((sum, run) => sum + run.picketScrews, 0);
  const rawRailScrews = runs.reduce((sum, run) => sum + run.railPieces * 4, 0);

  return {
    errors: [],
    runs,
    posts,
    bays,
    cornerHeight,
    embed,
    concretePer,
    concrete,
    gravel,
    bags: roundUp((concrete * wasteFactor) / v.yield),
    bagsNoWaste: roundUp(concrete / v.yield),
    gravelBuy: gravel * wasteFactor,
    pickets: toPurchaseGroups(byPicket),
    postGroups: toPurchaseGroups(byPost),
    railGroups: toPurchaseGroups(byRail),
    picketScrews: roundUp(rawPicketScrews * wasteFactor),
    railScrews: roundUp(rawRailScrews * wasteFactor),
    total: runs.reduce((sum, run) => sum + run.length, 0),
  };
}
