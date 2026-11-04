# Fence Material Planner

Interactive two-run fence material estimator for 574 Oakwood, with a survey-informed 2D plan and Three.js 3D preview.

## Run locally

No build step or dependency installation is required. Serve `dist/` over HTTP (opening the HTML directly will not load modules and geometry correctly):

```sh
python3 -m http.server 8000 --directory dist
```

Open http://localhost:8000.

## Tests

Use Node.js 24 or later:

```sh
npm test
```

Tests cover material calculations (including 288 mixed boundary configurations), pointer/keyboard controls, and scene geometry. Scene tests use real Three.js geometry with a mocked GPU renderer; they do not verify browser rendering or GPU artifacts.

## Controls

- Drag each endpoint to change total run length; use Exact length for numeric entry.
- Drag the 4-foot transition handle to set short-section length. It stays fixed in feet on resize and clamps to the available length. East and North controls are mirrored.
- Focus a handle and use arrow keys (Shift for larger steps), Home, or End.
- Switch between 2D and 3D, zoom, pan/orbit, and use SW view to reset framing.
- Cycle Buildings through Normal, Ghost, and Footprint.
- Expand Construction settings to adjust spacing, materials, waste, and footing assumptions. Print the current estimate with Print.

## Source layout

- `dist/calc.js`: shared material calculation engine.
- `dist/app.js`: controls and material summary.
- `dist/scene.js`: Three.js scene and 2D fallback.
- `dist/geometry.js`, `dist/geometry.json`: modeled site geometry.
- `dist/vendor/`: vendored Three.js modules and their license.
- `tests/`: calculation, controls, and scene regression checks.
- `.openai/hosting.json`: identity and static directory for the existing hosted Site.

`dist/` is the editable source and deployable static directory; it is intentionally tracked. This repository is a source import; GitHub pushes do not automatically deploy the existing Site.

## Assumptions and limits

This is a planning aid, not a certified survey or permit approval. Lot edges follow an approximate survey fit; building roof shapes and shed placement include provisional assumptions. The interface lists these assumptions and approximate clearances. Confirm property lines, setbacks, fence heights, utilities, frost depth, and construction details before building. No gates, labor, demolition, or delivery are included.

Material estimates split each height section into bays no longer than the configured spacing, count the northeast corner once, and round purchase quantities with waste. Verify stock sizes, fasteners, connections, and footing specifications for the actual installation.

## Third-party license

Three.js is distributed under the MIT license; see `dist/vendor/THREE-LICENSE.txt`. No additional license for the application source is declared here.
