import { calculate, defaults } from './calc.js';
import { bindControls } from './controls.js';
import siteGeometry from './data/site.json' with { type: 'json' };
import { renderEstimate, renderRunProfiles } from './estimate.js';
import { resolveFencePlanGeometry } from './terrain.js';
import { createViewer } from './viewer.js';

/**
 * Initializes the fence planner application, owning the authoritative input/estimate state
 * and wiring controls, estimate rendering, and the 2D/3D viewer through explicit callbacks.
 * Accepts an optional custom `geometry` dataset for different properties, houses, fence plans,
 * elevation models, or satellite imagery overlays.
 *
 * @param {Object} [options]
 * @param {Document} [options.doc]
 * @param {Object} [options.geometry]
 * @param {() => void} [options.onPrint]
 * @param {(THREE: typeof import('three')) => any} [options.createRenderer]
 * @param {() => Promise<typeof import('./scene/index.js')>} [options.loadSceneModule]
 */
export function initPlanner({
  doc = typeof document !== 'undefined' ? document : undefined,
  geometry = siteGeometry,
  onPrint,
  createRenderer,
  loadSceneModule,
} = {}) {
  const fencePlan = resolveFencePlanGeometry(geometry);
  const runLimits = {
    east: fencePlan.runs.east.maxLength,
    north: fencePlan.runs.north.maxLength,
  };
  const initialDefaults = {
    ...defaults,
    east: fencePlan.runs.east.defaultLength,
    north: fencePlan.runs.north.defaultLength,
    em: fencePlan.runs.east.defaultMode,
    nm: fencePlan.runs.north.defaultMode,
    et: fencePlan.runs.east.defaultTransition,
    nt: fencePlan.runs.north.defaultTransition,
  };

  let currentState = {
    values: { ...initialDefaults },
    estimate: calculate(initialDefaults, { runLimits }),
  };

  let viewer = null;

  const controls = bindControls({
    doc,
    runLimits,
    initialDefaults,
    onPrint,
    onChange(values, shortLengths) {
      const estimate = calculate(values, { runLimits });
      renderEstimate(doc, values, estimate);
      if (estimate.errors.length > 0) {
        return;
      }
      renderRunProfiles(doc, values, shortLengths, runLimits);
      currentState = { values, estimate };
      viewer?.update(currentState);
    },
    onReset() {
      viewer?.fit();
    },
  });

  // Populate initial inputs and render initial estimate before starting viewer
  controls.reset();

  viewer = createViewer({
    doc,
    geometry,
    initialState: currentState,
    createRenderer,
    loadSceneModule,
  });

  return {
    controls,
    viewer,
    getState() {
      return currentState;
    },
    destroy() {
      viewer.destroy();
    },
  };
}

if (typeof document !== 'undefined' && document.getElementById('viewer')) {
  initPlanner();
}
