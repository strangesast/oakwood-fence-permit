import siteGeometry from './data/site.json' with { type: 'json' };

/**
 * Pure run-state rules, boundary limits, and mirrored coordinate conversions.
 * Defaults to the 574 Oakwood site configuration (`site.json`) while accepting
 * custom run limits/specifications for other properties and fence plans.
 */

const defaultRunsConfig = siteGeometry.fencePlan?.runs || {};

/**
 * Maximum legal boundary lengths in feet from the active site configuration.
 * @type {{ east: number, north: number }}
 */
export const RUN_MAX_FT = Object.freeze({
  east: defaultRunsConfig.east?.maxLength ?? 101.5,
  north: defaultRunsConfig.north?.maxLength ?? 61.5,
});

/**
 * Default input settings for the fence calculator.
 */
export const DEFAULT_INPUTS = Object.freeze({
  east: defaultRunsConfig.east?.defaultLength ?? 81.5,
  north: defaultRunsConfig.north?.defaultLength ?? 41.5,
  em: defaultRunsConfig.east?.defaultMode ?? '6',
  nm: defaultRunsConfig.north?.defaultMode ?? '6',
  et: defaultRunsConfig.east?.defaultTransition ?? 40,
  nt: defaultRunsConfig.north?.defaultTransition ?? 20,
  rails6: 3,
  rails4: 2,
  spacing: 8,
  width: 5.5,
  gap: 0,
  diameter: 12,
  depth: 48,
  gravel: 6,
  post: 3.5,
  yield: 0.6,
  waste: 10,
});

export const HANDLE_STEP_FT = 0.5;
export const HANDLE_SHIFT_STEP_FT = 5;

function isLeftToRightRun(run, runsConfig = defaultRunsConfig) {
  const dir = runsConfig?.[run]?.uiDirection;
  if (dir) return dir === 'ltr';
  return run === 'east';
}

function getRunMaxFt(run, runLimits = RUN_MAX_FT) {
  return runLimits?.[run] ?? RUN_MAX_FT[run] ?? 100;
}

/**
 * Rounds a length in feet to the nearest 0.5 ft increment.
 * @param {number} feet
 * @returns {number}
 */
export function roundToHalfFoot(feet) {
  return Math.round(feet * 2) / 2;
}

/**
 * Clamps a run length in feet to [0, runLimits[run]] and snaps to 0.5 ft.
 * @param {'east' | 'north'} run
 * @param {number} lengthFt
 * @param {Record<string, number>} [runLimits]
 * @returns {number}
 */
export function clampRunLength(run, lengthFt, runLimits = RUN_MAX_FT) {
  const max = getRunMaxFt(run, runLimits);
  const rounded = roundToHalfFoot(Number(lengthFt) || 0);
  return Math.max(0, Math.min(max, rounded));
}

/**
 * Clamps the 4-foot short-section length to the available total run length,
 * deriving the corresponding height mode ('6', '4', or 'split') and 6-foot transition distance.
 *
 * @param {number} totalLengthFt Total run length in feet
 * @param {number} shortLengthFt Desired 4-foot section length in feet
 */
export function resolveRunHeightState(totalLengthFt, shortLengthFt) {
  const length = Math.max(0, Number(totalLengthFt) || 0);
  const shortLength = Math.max(0, Math.min(length, Number(shortLengthFt) || 0));
  const sixLength = length - shortLength;
  const mode = shortLength === 0 ? '6' : shortLength === length ? '4' : 'split';
  return {
    length,
    shortLength,
    sixLength,
    mode,
    transition: sixLength,
  };
}

/**
 * Computes the horizontal track coordinate (in feet from the left edge of the card)
 * for either the outer endpoint handle ('length') or the height-transition handle ('short').
 *
 * @param {'east' | 'north'} run
 * @param {'length' | 'short'} handleKind
 * @param {number} lengthFt
 * @param {number} shortLengthFt
 * @param {Record<string, number>} [runLimits]
 * @returns {number}
 */
export function getHandleTrackCoordinate(
  run,
  handleKind,
  lengthFt,
  shortLengthFt,
  runLimits = RUN_MAX_FT
) {
  const max = getRunMaxFt(run, runLimits);
  const ltr = isLeftToRightRun(run);
  const length = Math.max(0, Number(lengthFt) || 0);
  const short = Math.max(0, Math.min(length, Number(shortLengthFt) || 0));
  if (handleKind === 'length') {
    return ltr ? length : max - length;
  }
  return ltr ? length - short : max - length + short;
}

/**
 * Converts a left-to-right track coordinate (in feet) from a pointer or keyboard gesture
 * into an updated run state, preserving fixed short-section feet on extension and clamping on shortening.
 *
 * @param {'east' | 'north'} run
 * @param {'length' | 'short'} handleKind
 * @param {number} coordinateFt
 * @param {number} currentLengthFt
 * @param {number} currentShortFt
 * @param {Record<string, number>} [runLimits]
 */
export function applyHandleTrackCoordinate(
  run,
  handleKind,
  coordinateFt,
  currentLengthFt,
  currentShortFt,
  runLimits = RUN_MAX_FT
) {
  const max = getRunMaxFt(run, runLimits);
  const ltr = isLeftToRightRun(run);
  if (handleKind === 'length') {
    const rawLength = ltr ? coordinateFt : max - coordinateFt;
    const nextLength = clampRunLength(run, rawLength, runLimits);
    return resolveRunHeightState(nextLength, currentShortFt);
  }
  const length = Math.max(0, Number(currentLengthFt) || 0);
  const rawShort = ltr ? length - coordinateFt : coordinateFt - (max - length);
  const nextShort = roundToHalfFoot(rawShort);
  return resolveRunHeightState(length, nextShort);
}

/**
 * Computes the next track coordinate for a keyboard navigation key on a handle.
 *
 * @param {'east' | 'north'} run
 * @param {string} key
 * @param {boolean} shiftKey
 * @param {number} currentCoordinateFt
 * @param {Record<string, number>} [runLimits]
 * @returns {number | null}
 */
export function stepHandleCoordinateFromKey(
  run,
  key,
  shiftKey,
  currentCoordinateFt,
  runLimits = RUN_MAX_FT
) {
  const step = shiftKey ? HANDLE_SHIFT_STEP_FT : HANDLE_STEP_FT;
  if (key === 'ArrowRight' || key === 'ArrowUp') {
    return currentCoordinateFt + step;
  }
  if (key === 'ArrowLeft' || key === 'ArrowDown') {
    return currentCoordinateFt - step;
  }
  if (key === 'Home') {
    return 0;
  }
  if (key === 'End') {
    return getRunMaxFt(run, runLimits);
  }
  return null;
}

/**
 * Computes CSS custom property percentages and handle proximity for a run profile card.
 *
 * @param {'east' | 'north'} run
 * @param {number} lengthFt
 * @param {number} shortLengthFt
 * @param {Record<string, number>} [runLimits]
 */
export function computeRunProfileLayout(run, lengthFt, shortLengthFt, runLimits = RUN_MAX_FT) {
  const max = getRunMaxFt(run, runLimits);
  const ltr = isLeftToRightRun(run);
  const { length, shortLength, sixLength } = resolveRunHeightState(lengthFt, shortLengthFt);
  const lengthPct = (length / max) * 100;
  const fourPct = length > 0 ? (shortLength / length) * 100 : 0;
  const startPct = ltr ? 0 : 100 - lengthPct;
  const endpointPct = ltr ? lengthPct : startPct;
  const dividerPct = ltr
    ? ((length - shortLength) / max) * 100
    : startPct + (shortLength / max) * 100;
  const sliderValue = ltr ? sixLength : shortLength;

  return {
    max,
    length,
    shortLength,
    sixLength,
    sliderValue,
    lengthPct,
    fourPct,
    startPct,
    endpointPct,
    dividerPct,
    nearHandles: Math.abs(endpointPct - dividerPct) < 32,
    isEmpty: length === 0,
  };
}
