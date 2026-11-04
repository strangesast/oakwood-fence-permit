# Fence Material Planner

Interactive two-run fence material estimator for 574 Oakwood, with a survey-informed 2D SVG plan and Three.js (`three@0.180.0`) 3D preview.

## Requirements

- Node.js 24 or later (`.nvmrc` specifies `24`).

## Commands

| Command                     | Description                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| `npm ci` (or `npm install`) | Install locked dependencies (`package-lock.json`)                                                   |
| `npm run dev`               | Start the Vite local development server at `/oakwood-fence-permit/`                                 |
| `npm test`                  | Run native Node (`node --test`) calculation, run-state, controls, 3D scene, and extensibility tests |
| `npm run lint`              | Lint all JavaScript modules with ESLint                                                             |
| `npm run format:check`      | Check formatting of HTML, CSS, JS, JSON, and Markdown with Prettier                                 |
| `npm run build`             | Build production assets into `dist/` (ignored by Git)                                               |
| `npm run preview`           | Serve the production build locally at `http://127.0.0.1:4173/oakwood-fence-permit/`                 |
| `npm run test:browser`      | Run the Playwright browser suite against the production build at `/oakwood-fence-permit/`           |
| `npm run check`             | Run formatting check, lint, unit/scene tests, production build, and Git tracking check              |

## Hosting

The planner is hosted at [strangesast.github.io/oakwood-fence-permit](https://strangesast.github.io/oakwood-fence-permit/).

Every push to `main` runs the [GitHub Pages workflow](.github/workflows/pages.yml): locked dependency installation, formatting/lint checks, unit and scene tests, a production build, dependency audit, and browser tests. Pull requests run the same checks without publishing. The workflow uses Node.js 24 from `.nvmrc`.

After the checks pass, the workflow uploads `dist/` as a Pages artifact and deploys that exact build. Generated assets stay out of Git. The `github-pages` environment allows deployment only from `main`, and superseded builds do not replace a newer revision. The workflow can also be started manually from the Actions tab.

Repository Settings → Pages must use **GitHub Actions** as its source. Vite's `base` is `/oakwood-fence-permit/`; update it if the project URL changes. To roll back an application change, revert its commit and push to `main`, then verify the resulting Pages deployment. Inspect build/deployment logs with `gh run list --workflow pages.yml` and `gh run view <run-id> --log-failed`.

## Controls

- Drag each endpoint (`↔`) to change total run length; use **Exact length** for numeric entry.
- Drag the 4-foot transition handle (`4′`) to set short-section length. It stays fixed in feet on resize and clamps to the available length. East and North controls are mirrored.
- Focus a handle and use arrow keys (`Shift` for 5 ft steps), `Home`, or `End`.
- Switch between **2D** and **3D**, zoom (`＋` / `−`), pan/orbit, and use **SW view** to reset framing.
- Cycle **Buildings** through `Normal`, `Ghost`, and `Footprint`.
- Expand **Construction settings** to adjust spacing, materials, waste, and footing assumptions. Print the current estimate with **Print**.

## Source Layout

- `index.html`: Semantic HTML document and single module entry point (`/src/main.js`).
- `src/main.js`: Application startup and single state owner connecting controls, estimate rendering, and the viewer.
- `src/calc.js`: Pure input validation and material calculation engine (`defaults`, `calculate`).
- `src/run-state.js`: Pure run limits, half-foot rounding, short-section growth/clamping, and mirrored East/North track coordinate math.
- `src/controls.js`: DOM input bindings, mirrored point-handle pointer/keyboard interaction, reset, and print handlers.
- `src/estimate.js`: Bill of materials rendering, validation error display, math breakdown, and profile card ARIA/CSS updates.
- `src/viewer.js`: 2D/3D viewer lifecycle (`update`, `fit`, `renderScene`, `getState`, `destroy`), pointer/wheel navigation, building visibility modes, WebGL fallback, and resource disposal.
- `src/plan.js`: Pure 2D SVG survey plan generator and coordinate projection helpers.
- `src/terrain.js`: Elevation sampler (`flat`, `slope`, and 2D bilinear `grid` DEMs) and parameterized fence-plan vector/origin resolver.
- `src/scene/index.js`: Dynamically imported 3D scene entry bundle (`three@0.180.0` + scene builders).
- `src/scene/fence.js`: Pure Three.js fence mesh construction (posts, caps, transition rings, rails, and instanced pickets).
- `src/scene/site.js`: Static Three.js ground, optional satellite imagery overlay, non-overlapping road/sidewalk regions, centerlines, curbs, footprints, lot boundary, and ground-anchored street text.
- `src/scene/buildings.js`: Parameterized low-poly house and scaled shed 3D modeling, wraparound porch roof clipping/closures, and isolated Normal/Ghost/Footprint materials.
- `src/data/site.json`: Single authoritative geometry dataset shared by runtime code and tests, with documented coordinate axes, units, house massing parameters, fence plan specs, elevation model, and optional satellite imagery hooks.
- `src/style.css`: Responsive layout, tactile profile handle styling, and print stylesheet.
- `public/THREE-LICENSE.txt`: Retained Three.js MIT license notice copied into `dist/THREE-LICENSE.txt` on build.
- `tests/`: Native ESM unit, scene, and extensibility tests (`calc.test.js`, `controls.test.js`, `scene.test.js`, `extensibility.test.js`) and Playwright browser tests (`tests/browser/planner.spec.js`).

## Extensibility & Custom Site Parameters

All site-specific geometry and assumptions live declaratively in `src/data/site.json` (or a custom `geometry` object passed to `initPlanner({ geometry })` / `createViewer({ geometry })`):

- **Custom property shapes & fence plans (`lot`, `fencePlan`):** Define any property polygon `lot: [[x, y], ...]` and configure each run's `origin`, `direction` vector, `maxLength`, `defaultLength`, `defaultMode`, `defaultTransition`, and `uiDirection` (`'ltr'` or `'rtl'`).
- **Custom house footprints & building massing (`house`, `porches`, `houseModel`, `shed`):** Change `house` vertices, `wallHeightFt`, `gables`, `porchWraparound`, `frontPorch`, windows/doors, or omit `shed` (`null`) without modifying rendering code.
- **Elevation / topography data (`elevation`):** Set `elevation` to `{ mode: 'flat', baseElevationFt: 0 }`, `{ mode: 'slope', origin: [x0, y0], baseElevationFt, gradeX, gradeY }`, or `{ mode: 'grid', bounds: { minX, maxX, minY, maxY }, cols, rows, heights: [...] }` to automatically elevate ground polygons, buildings, and fence posts/rails/pickets across the terrain.
- **Satellite / aerial imagery (`imagery`):** Provide `{ url, bounds: { minX, maxX, minY, maxY }, opacity, elevationFt, rotationRad }` to render a registered overhead ortho/satellite photo beneath the lot in both the 2D SVG plan and 3D Three.js scene.

## Assumptions & Limits

This is a planning aid, not a certified survey or permit approval. Lot edges follow an approximate survey fit; building roof shapes and shed placement include provisional assumptions. Confirm property lines, setbacks, fence heights, utilities, frost depth, and construction details before building. No gates, labor, demolition, or delivery are included.

## Third-Party License

Three.js (`three@0.180.0`) is distributed under the MIT license; see `public/THREE-LICENSE.txt`.
