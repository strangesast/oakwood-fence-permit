import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate, defaults } from '../src/calc.js';
import { bindControls } from '../src/controls.js';
import { renderEstimate, renderRunProfiles } from '../src/estimate.js';
import {
  applyHandleTrackCoordinate,
  computeRunProfileLayout,
  getHandleTrackCoordinate,
  resolveRunHeightState,
  RUN_MAX_FT,
} from '../src/run-state.js';

function createMockDoc() {
  const elements = {};
  const getEl = (id) => {
    if (!elements[id]) {
      elements[id] = {
        id,
        value: '',
        innerHTML: '',
        textContent: '',
        disabled: false,
        max: id === 'handle-east' ? 101.5 : 61.5,
        listeners: {},
        classes: new Set(),
        style: {
          setProperty(k, v) {
            this[k] = v;
          },
        },
        classList: {
          toggle(cls, force) {
            if (force === undefined) {
              if (elements[id].classes.has(cls)) elements[id].classes.delete(cls);
              else elements[id].classes.add(cls);
            } else if (force) {
              elements[id].classes.add(cls);
            } else {
              elements[id].classes.delete(cls);
            }
          },
          contains(cls) {
            return elements[id].classes.has(cls);
          },
        },
        setAttribute(k, v) {
          this[k] = v;
        },
        addEventListener(type, fn) {
          this.listeners[type] = fn;
        },
        setPointerCapture() {},
        closest() {
          return {
            getBoundingClientRect: () => ({ width: 200 }),
          };
        },
      };
    }
    return elements[id];
  };

  return {
    elements,
    getElementById: getEl,
    querySelector: (selector) => getEl(selector),
  };
}

test('pure run-state coordinate and clamping rules', () => {
  assert.deepEqual(resolveRunHeightState(60, 0), {
    length: 60,
    shortLength: 0,
    sixLength: 60,
    mode: '6',
    transition: 60,
  });
  assert.deepEqual(resolveRunHeightState(60, 60), {
    length: 60,
    shortLength: 60,
    sixLength: 0,
    mode: '4',
    transition: 0,
  });
  assert.deepEqual(resolveRunHeightState(60, 25), {
    length: 60,
    shortLength: 25,
    sixLength: 35,
    mode: 'split',
    transition: 35,
  });
  assert.deepEqual(resolveRunHeightState(15, 40), {
    length: 15,
    shortLength: 15,
    sixLength: 0,
    mode: '4',
    transition: 0,
  });

  // Mirrored coordinates: East starts at 0 (left), North starts at 61.5 (right)
  assert.equal(getHandleTrackCoordinate('east', 'length', 50, 10), 50);
  assert.equal(getHandleTrackCoordinate('east', 'short', 50, 10), 40);
  assert.equal(getHandleTrackCoordinate('north', 'length', 50, 10), 11.5);
  assert.equal(getHandleTrackCoordinate('north', 'short', 50, 10), 21.5);

  const eastMoved = applyHandleTrackCoordinate('east', 'short', 35, 50, 10);
  assert.equal(eastMoved.shortLength, 15);
  const northMoved = applyHandleTrackCoordinate('north', 'short', 26.5, 50, 10);
  assert.equal(northMoved.shortLength, 15);

  const northLayout = computeRunProfileLayout('north', 50, 10);
  assert(Math.abs(northLayout.endpointPct - (100 - (50 / 61.5) * 100)) < 1e-6);
  assert(Math.abs(northLayout.dividerPct - (100 - (40 / 61.5) * 100)) < 1e-6);
});

test('point-handle pointer and keyboard, mirrored East/North placement, grow/clamp/zero/full, and BOM', () => {
  const doc = createMockDoc();
  let lastState = null;
  let resetCalls = 0;
  let printCalls = 0;

  const controls = bindControls({
    doc,
    onPrint: () => {
      printCalls++;
    },
    onChange(values, shortLengths) {
      const estimate = calculate(values);
      renderEstimate(doc, values, estimate);
      if (estimate.errors.length === 0) {
        renderRunProfiles(doc, values, shortLengths);
        lastState = { v: values, c: estimate };
      }
    },
    onReset: () => {
      resetCalls++;
    },
  });

  controls.reset();
  assert.equal(resetCalls, 1);
  assert(doc.elements.results.innerHTML.includes('296'));

  const pressKey = (id, key, shiftKey = false) =>
    doc.elements[id].listeners.keydown({
      key,
      shiftKey,
      preventDefault() {},
    });

  const shortFeetFor = (run) =>
    lastState.c.runs
      .find((x) => x.key === run)
      ?.segments.filter((x) => x.height === 4)
      .reduce((a, s) => a + s.length, 0) || 0;

  for (const run of ['east', 'north']) {
    const ep = `handle-${run}`;
    const tr = `${run}-height-slider`;
    const max = RUN_MAX_FT[run];

    controls.setFenceLength(run, 40);
    pressKey(tr, run === 'east' ? 'Home' : 'End');
    assert.equal(shortFeetFor(run), 40);

    controls.setFenceLength(run, 60);
    assert.equal(shortFeetFor(run), 40);

    controls.setFenceLength(run, 15);
    assert.equal(shortFeetFor(run), 15);

    controls.setFenceLength(run, 30);
    assert.equal(shortFeetFor(run), 15);

    pressKey(tr, run === 'east' ? 'End' : 'Home');
    assert.equal(shortFeetFor(run), 0);

    const button = doc.elements[tr];
    button.listeners.pointerdown({
      pointerId: 1,
      clientX: 100,
      preventDefault() {},
    });
    button.listeners.pointermove({
      pointerId: 1,
      clientX: 100 + ((run === 'east' ? -1 : 1) * 10 * 200) / max,
      preventDefault() {},
    });
    button.listeners.pointerup();

    assert.equal(shortFeetFor(run), 10);
    assert.equal(Number(doc.elements[tr]['aria-valuenow']), 10);

    controls.setFenceLength(run, 50);
    assert.equal(shortFeetFor(run), 10);

    const cardStyle = doc.elements[`.${run}-control`].style;
    assert(
      Math.abs(
        parseFloat(cardStyle['--endpoint']) -
          (run === 'east' ? (50 / max) * 100 : 100 - (50 / max) * 100)
      ) < 1e-6
    );
    assert(
      Math.abs(
        parseFloat(cardStyle['--divider']) -
          (run === 'east' ? (40 / max) * 100 : 100 - (40 / max) * 100)
      ) < 1e-6
    );

    // Arrow key steps (0.5 ft and 5 ft with Shift)
    pressKey(ep, run === 'east' ? 'ArrowRight' : 'ArrowLeft', false);
    assert.equal(lastState.v[run], 50.5);
    pressKey(ep, run === 'east' ? 'ArrowLeft' : 'ArrowRight', true);
    assert.equal(lastState.v[run], 45.5);

    pressKey(ep, run === 'east' ? 'Home' : 'End');
    assert.equal(lastState.v[run], 0);
    assert(doc.elements[tr].disabled);

    pressKey(ep, run === 'east' ? 'End' : 'Home');
    assert.equal(lastState.v[run], max);
    assert.equal(shortFeetFor(run), 0);
  }

  // Validation error and recovery without losing valid viewer state
  const validSnapshot = lastState;
  doc.elements.spacing.value = '0';
  doc.elements.spacing.listeners.input();
  assert(doc.elements.errors.innerHTML.includes('greater than zero'));
  assert.equal(doc.elements.results.innerHTML, '');
  assert.equal(lastState, validSnapshot);

  doc.elements.spacing.value = String(defaults.spacing);
  doc.elements.spacing.listeners.input();
  assert.equal(doc.elements.errors.innerHTML, '');
  assert(doc.elements.results.innerHTML.includes('posts installed'));

  doc.elements.print.onclick();
  assert.equal(printCalls, 1);
});
