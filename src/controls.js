import { defaults } from './calc.js';
import {
  applyHandleTrackCoordinate,
  clampRunLength,
  getHandleTrackCoordinate,
  resolveRunHeightState,
  RUN_MAX_FT,
  stepHandleCoordinateFromKey,
} from './run-state.js';

/**
 * Binds numeric form inputs, mirrored East/North point handles (pointer and keyboard),
 * reset, and print controls to explicit application callbacks.
 *
 * @param {Object} options
 * @param {Document} [options.doc]
 * @param {{ east: number, north: number }} [options.runLimits]
 * @param {Record<string, any>} [options.initialDefaults]
 * @param {() => void} [options.onPrint]
 * @param {(values: Record<string, any>, shortLengths: { east: number, north: number }) => void} options.onChange
 * @param {() => void} [options.onReset]
 */
export function bindControls({
  doc = document,
  runLimits = RUN_MAX_FT,
  initialDefaults = defaults,
  onPrint = () => window.print(),
  onChange,
  onReset,
}) {
  const inputKeys = Object.keys(defaults);
  const inputElements = Object.fromEntries(inputKeys.map((key) => [key, doc.getElementById(key)]));
  const shortLengths = { east: 0, north: 0 };

  function syncShortLengthToInputs(run) {
    const rawLength = Math.max(0, Number(inputElements[run].value) || 0);
    const resolved = resolveRunHeightState(rawLength, shortLengths[run]);
    shortLengths[run] = resolved.shortLength;
    const modeKey = run === 'east' ? 'em' : 'nm';
    const transitionKey = run === 'east' ? 'et' : 'nt';
    inputElements[modeKey].value = resolved.mode;
    inputElements[transitionKey].value = resolved.transition;
  }

  function readInputValues() {
    const values = {};
    for (const key of inputKeys) {
      const el = inputElements[key];
      if (key === 'em' || key === 'nm') {
        values[key] = el.value;
      } else {
        values[key] = el.value === '' ? Number.NaN : Number(el.value);
      }
    }

    for (const [run, transitionKey] of [
      ['east', 'et'],
      ['north', 'nt'],
    ]) {
      if (Number.isFinite(values[run]) && values[run] >= 0 && values[transitionKey] > values[run]) {
        values[transitionKey] = values[run];
        inputElements[transitionKey].value = values[transitionKey];
      }
    }

    return values;
  }

  function emitChange() {
    const values = readInputValues();
    onChange(values, shortLengths);
  }

  function setFenceLength(run, lengthFt) {
    inputElements[run].value = clampRunLength(run, lengthFt, runLimits);
    syncShortLengthToInputs(run);
    emitChange();
  }

  function setShortLength(run, shortLengthFt) {
    const currentLength = Number(inputElements[run].value);
    const resolved = resolveRunHeightState(currentLength, shortLengthFt);
    shortLengths[run] = resolved.shortLength;
    syncShortLengthToInputs(run);
    emitChange();
  }

  function resetInputs() {
    shortLengths.east = 0;
    shortLengths.north = 0;
    for (const key of inputKeys) {
      inputElements[key].value = initialDefaults[key] ?? defaults[key];
    }
    emitChange();
    onReset?.();
  }

  for (const key of inputKeys) {
    const el = inputElements[key];
    el.addEventListener('input', () => {
      if (key === 'east' || key === 'north') {
        syncShortLengthToInputs(key);
      }
      emitChange();
    });
  }

  for (const run of /** @type {const} */ (['east', 'north'])) {
    const endpointButton = doc.getElementById(`handle-${run}`);
    const transitionButton = doc.getElementById(`${run}-height-slider`);

    // Only the two point handles accept pointer or keyboard gestures; empty track does not move handles.
    for (const [button, handleKind] of /** @type {const} */ ([
      [endpointButton, 'length'],
      [transitionButton, 'short'],
    ])) {
      let dragState = null;

      const currentCoordinate = () => {
        const length = Number(inputElements[run].value);
        return getHandleTrackCoordinate(run, handleKind, length, shortLengths[run], runLimits);
      };

      const applyCoordinate = (coordinateFt) => {
        const currentLength = Number(inputElements[run].value);
        const next = applyHandleTrackCoordinate(
          run,
          handleKind,
          coordinateFt,
          currentLength,
          shortLengths[run],
          runLimits
        );
        if (handleKind === 'length') {
          setFenceLength(run, next.length);
        } else {
          setShortLength(run, next.shortLength);
        }
      };

      button.addEventListener('pointerdown', (event) => {
        if (button.disabled) return;
        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        const track = button.closest('.profile-rectangle');
        const width = track?.getBoundingClientRect().width || 1;
        dragState = {
          id: event.pointerId,
          startX: event.clientX,
          startCoord: currentCoordinate(),
          width,
        };
      });

      button.addEventListener('pointermove', (event) => {
        if (!dragState || event.pointerId !== dragState.id) return;
        event.preventDefault();
        const deltaCoord = ((event.clientX - dragState.startX) / dragState.width) * runLimits[run];
        applyCoordinate(dragState.startCoord + deltaCoord);
      });

      for (const eventType of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        button.addEventListener(eventType, () => {
          dragState = null;
        });
      }

      button.addEventListener('keydown', (event) => {
        const nextCoord = stepHandleCoordinateFromKey(
          run,
          event.key,
          Boolean(event.shiftKey),
          currentCoordinate(),
          runLimits
        );
        if (nextCoord === null) return;
        event.preventDefault();
        applyCoordinate(nextCoord);
      });
    }
  }

  doc.getElementById('reset').onclick = resetInputs;
  doc.getElementById('print').onclick = () => onPrint();

  return {
    reset: resetInputs,
    setFenceLength,
    setShortLength,
    getShortLengths: () => ({ ...shortLengths }),
    readInputValues,
  };
}
