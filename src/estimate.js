import { computeRunProfileLayout, RUN_MAX_FT } from './run-state.js';

/**
 * Formats a number with locale separators and a maximum number of fraction digits.
 * @param {number} value
 * @param {number} [maxDigits=2]
 * @returns {string}
 */
export function formatNumber(value, maxDigits = 2) {
  return value.toLocaleString(undefined, { maximumFractionDigits: maxDigits });
}

function renderBomRow(title, subtitle, quantity) {
  return `<div class="bomrow"><div class="name">${title}<small>${subtitle}</small></div><strong>${quantity}</strong></div>`;
}

/**
 * Updates the interactive East and North profile cards, handle ARIA attributes,
 * and CSS custom properties to reflect the current valid fence configuration.
 *
 * @param {Document} doc
 * @param {Record<string, any>} values
 * @param {{ east: number, north: number }} shortLengths
 * @param {{ east: number, north: number }} [runLimits]
 */
export function renderRunProfiles(doc, values, shortLengths, runLimits = RUN_MAX_FT) {
  const runConfigs = [
    ['east', 'em', 'et'],
    ['north', 'nm', 'nt'],
  ];

  for (const [run, modeKey, transitionKey] of runConfigs) {
    const totalLength = values[run];
    const sixLength =
      values[modeKey] === '6' ? totalLength : values[modeKey] === '4' ? 0 : values[transitionKey];
    const shortLength = totalLength - sixLength;
    shortLengths[run] = shortLength;

    const slider = doc.getElementById(`${run}-height-slider`);
    slider.max = totalLength;
    slider.value = run === 'east' ? sixLength : shortLength;
    slider.setAttribute('aria-valuemax', totalLength);
    slider.setAttribute('aria-valuenow', shortLength);
    slider.setAttribute(
      'aria-valuetext',
      totalLength === 0
        ? 'No fence'
        : sixLength === totalLength
          ? 'All 6 feet high'
          : sixLength === 0
            ? 'All 4 feet high'
            : `${formatNumber(shortLength)} feet of 4-foot fence; transition ${formatNumber(sixLength)} feet from the northeast corner; short length stays fixed when resizing`
    );

    doc.getElementById(`${run}-transition-location`).textContent =
      totalLength === 0
        ? 'No fence on this run'
        : sixLength === totalLength
          ? 'All 6 ft high · no transition'
          : sixLength === 0
            ? 'All 4 ft high · no transition'
            : `6 → 4 ft at ${formatNumber(sixLength)} ft from the NE corner`;

    doc.getElementById(`${run}-segment-summary`).textContent =
      `${formatNumber(sixLength)} ft at 6 ft high · ${formatNumber(shortLength)} ft at 4 ft high`;
  }

  for (const run of /** @type {const} */ (['east', 'north'])) {
    const layout = computeRunProfileLayout(run, values[run], shortLengths[run], runLimits);
    const lengthControl = doc.getElementById(`handle-${run}`);
    lengthControl.max = layout.max;
    lengthControl.value = layout.length;
    lengthControl.setAttribute('aria-valuenow', layout.length);
    lengthControl.style.setProperty(
      '--fill',
      `${(layout.length / Number(lengthControl.max)) * 100}%`
    );
    lengthControl.setAttribute(
      'aria-valuetext',
      layout.isEmpty ? 'No fence' : `${formatNumber(layout.length)} feet`
    );

    const splitControl = doc.getElementById(`${run}-height-slider`);
    splitControl.style.setProperty('--fill', `${splitControl.value}%`);

    const card = doc.querySelector(`.${run}-control`);
    card.style.setProperty('--length', `${layout.lengthPct}%`);
    card.style.setProperty('--four', `${layout.fourPct}%`);
    card.style.setProperty('--start', `${layout.startPct}%`);
    card.style.setProperty('--endpoint', `${layout.endpointPct}%`);
    card.style.setProperty('--divider', `${layout.dividerPct}%`);
    card.classList.toggle('near-handles', layout.nearHandles);
    splitControl.disabled = layout.isEmpty;
    card.classList.toggle('empty-run', layout.isEmpty);

    doc.getElementById(`${run}-divide-label`).textContent =
      `${formatNumber(layout.shortLength, 1)} ft short`;
    doc.getElementById(`${run}-length-label`).textContent =
      `${formatNumber(layout.length, 1)} / ${lengthControl.max} ft`;
  }
}

/**
 * Renders validation errors or the bill of materials and calculation breakdown.
 *
 * @param {Document} doc
 * @param {Record<string, any>} values
 * @param {ReturnType<import('./calc.js').calculate>} estimate
 */
export function renderEstimate(doc, values, estimate) {
  const errorsEl = doc.getElementById('errors');
  const resultsEl = doc.getElementById('results');

  errorsEl.innerHTML = estimate.errors.map((err) => `<p>${err}</p>`).join('');
  if (estimate.errors.length > 0) {
    resultsEl.innerHTML = '';
    return;
  }

  resultsEl.innerHTML =
    `<div class="totals"><strong>${formatNumber(estimate.total)} ft</strong> total · <strong>${estimate.posts}</strong> posts installed · <strong>${estimate.bays}</strong> bays</div>` +
    estimate.postGroups
      .map((g) =>
        renderBomRow(
          `${g.length} ft posts`,
          `${values.post} in actual square · ${g.qty} required`,
          g.buy
        )
      )
      .join('') +
    estimate.railGroups
      .map((g) =>
        renderBomRow(
          `${g.length} ft rails`,
          `${g.qty} required · stock length covers each bay`,
          g.buy
        )
      )
      .join('') +
    estimate.pickets
      .map((g) =>
        renderBomRow(`${g.length} ft pickets`, `${values.width} in wide · ${g.qty} required`, g.buy)
      )
      .join('') +
    renderBomRow(
      'Concrete bags',
      `${values.yield} ft³ yield each · ${formatNumber(estimate.concrete)} ft³ net`,
      estimate.bags
    ) +
    renderBomRow(
      'Gravel',
      `${formatNumber(estimate.gravelBuy / 27)} cubic yards`,
      `${formatNumber(estimate.gravelBuy)} ft³`
    ) +
    `<p class="allowance">Buy quantities include ${values.waste}% allowance. No gates.</p>`;

  const mathEl = doc.getElementById('math');
  mathEl.innerHTML =
    estimate.runs
      .map(
        (run) =>
          `<p><strong>${run.name}:</strong> ` +
          run.segments
            .map(
              (seg) =>
                `${formatNumber(seg.length)} ft at ${seg.height} ft high: ${seg.bays} bays × ${formatNumber(seg.bayLength)} ft, ${seg.railPieces} rails, ${seg.pickets} pickets`
            )
            .join('; ') +
          '.</p>'
      )
      .join('') +
    `<p>Corner post height: ${estimate.cornerHeight} ft above grade. Post embedment: ${formatNumber(estimate.embed)} ft. Net concrete per hole: ${formatNumber(estimate.concretePer, 3)} ft³. ${estimate.posts} holes. Fastener planning allowances: ${estimate.picketScrews} picket fasteners and ${estimate.railScrews} rail fasteners, including waste; verify connection specification.</p>`;
}
