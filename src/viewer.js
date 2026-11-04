import { getHouseCenter, renderPlanSvg } from './plan.js';

const BUILDING_MODE_NAMES = {
  normal: 'Normal',
  ghost: 'Ghost',
  footprint: 'Footprint',
};

const NEXT_BUILDING_MODE = {
  normal: 'ghost',
  ghost: 'footprint',
  footprint: 'normal',
};

function createDomStreetTexture(doc, THREE, text) {
  const canvas = doc.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext?.('2d');
  if (ctx) {
    ctx.font = '400 64px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#697b6b';
    ctx.fillText(text, 512, 64);
  }
  return new THREE.CanvasTexture(canvas);
}

/**
 * Creates the 2D/3D fence viewer, managing camera navigation, building visibility modes,
 * WebGL fallback, resize handling, and GPU/listener cleanup.
 *
 * @param {Object} options
 * @param {Document} [options.doc]
 * @param {Object} options.geometry Authoritative site geometry dataset
 * @param {{ values: Record<string, any>, estimate: ReturnType<import('./calc.js').calculate> }} options.initialState
 * @param {(THREE: typeof import('three')) => any} [options.createRenderer] Optional WebGLRenderer factory for testing
 * @param {() => Promise<typeof import('./scene/index.js')>} [options.loadSceneModule] Optional scene loader
 */
export function createViewer({
  doc = document,
  geometry,
  initialState,
  createRenderer,
  loadSceneModule = () => import('./scene/index.js'),
}) {
  const host = doc.getElementById('scene');
  const viewerEl = doc.getElementById('viewer');
  const statusEl = doc.getElementById('viewstatus');
  const fallbackEl = doc.getElementById('fallback');
  const compassNeedleEl = doc.getElementById('compass-needle');
  const roadLabelsEl = doc.getElementById('road-labels');
  const buildingCycleBtn = doc.getElementById('building-cycle');
  const fitBtn = doc.getElementById('fit');
  const zoomInBtn = doc.getElementById('zoomIn');
  const zoomOutBtn = doc.getElementById('zoomOut');

  const houseCenter = getHouseCenter(geometry.house);
  const cornerPoint = geometry.lot[2];
  const listenerController = new AbortController();
  const { signal } = listenerController;

  let state = initialState;
  let mode = '3d';
  let buildingMode = 'normal';

  let sceneModule = null;
  let THREE = null;
  let renderer = null;
  let scene = null;
  let camera = null;
  let target = null;
  let fenceGroup = null;
  let houseGroup = null;
  let shedGroup = null;
  let buildingMeshes = [];
  let roadText = [];
  const fenceMaterials = [];
  let disposeSite = null;
  let disposeBuildings = null;

  let yaw = -0.64;
  let pitch = 0.65;
  let distance = 190;
  const pointers = new Map();
  let pinchDistance = 0;

  let planZoom = 1;
  let planCenter = [210, 205];
  let planPinchDistance = 0;
  const planPointers = new Map();

  const toggleBtn = doc.createElement('button');
  toggleBtn.id = 'view-toggle';
  toggleBtn.type = 'button';
  toggleBtn.textContent = '2D';
  toggleBtn.setAttribute('aria-label', 'Switch between 2D plan and 3D view');
  doc.querySelector('.viewtools').prepend(toggleBtn);

  function syncBuildingControl() {
    const currentLabel = BUILDING_MODE_NAMES[buildingMode];
    const nextLabel = BUILDING_MODE_NAMES[NEXT_BUILDING_MODE[buildingMode]];
    buildingCycleBtn.disabled = mode !== '3d';
    buildingCycleBtn.textContent = `Buildings: ${currentLabel} ↻`;
    buildingCycleBtn.setAttribute(
      'aria-label',
      `House and shed: ${currentLabel}. Next: ${nextLabel}.`
    );
    buildingCycleBtn.title =
      mode === '3d'
        ? 'Cycle building visibility'
        : '2D always shows footprints; your 3D choice is kept.';
  }

  function setLayers(nextMode) {
    mode = nextMode;
    const is3d = nextMode === '3d';
    host.hidden = !is3d;
    host.style.display = is3d ? 'block' : 'none';
    fallbackEl.toggleAttribute('hidden', is3d);
    fallbackEl.style.display = is3d ? 'none' : 'block';
    if (roadLabelsEl) {
      roadLabelsEl.hidden = true;
      roadLabelsEl.style.display = 'none';
    }
    pointers.clear();
    syncBuildingControl();
  }

  function drawFallback() {
    if (!state?.estimate) return;
    renderPlanSvg(fallbackEl, compassNeedleEl, geometry, state.estimate, planCenter, planZoom);
  }

  function enterFallbackView(reason = '2D plan · 3D unavailable') {
    setLayers('2d');
    statusEl.textContent = reason;
    drawFallback();
  }

  function applyPlanZoom(factor) {
    planZoom = Math.max(0.6, Math.min(5, planZoom * factor));
    drawFallback();
  }

  function renderScene() {
    if (mode !== '3d' || !renderer || !sceneModule) return;
    sceneModule.updateStreetTextOrientation(THREE, roadText, camera);
    renderer.render(scene, camera);

    const centerProjected = new THREE.Vector3(target.x, 0, target.z).project(camera);
    const northProjected = new THREE.Vector3(target.x, 0, target.z - 10).project(camera);
    const bearingDeg =
      (Math.atan2(
        (northProjected.x - centerProjected.x) * viewerEl.clientWidth,
        -(centerProjected.y - northProjected.y) * viewerEl.clientHeight
      ) *
        180) /
      Math.PI;
    compassNeedleEl.style.transform = `rotate(${bearingDeg}deg)`;
  }

  function updateCamera() {
    if (!camera) return;
    camera.position.set(
      target.x + distance * Math.cos(pitch) * Math.sin(yaw),
      distance * Math.sin(pitch),
      target.z + distance * Math.cos(pitch) * Math.cos(yaw)
    );
    camera.lookAt(target);
    camera.updateMatrixWorld();
    renderScene();
  }

  function fit() {
    if (mode === '2d') {
      planZoom = 1;
      planCenter = [210, 205];
      drawFallback();
      return;
    }
    if (!target) return;
    yaw = -0.64;
    pitch = 0.65;
    target.set(houseCenter[0], 7, -houseCenter[1]);
    distance = viewerEl.clientWidth / viewerEl.clientHeight < 1.4 ? 160 : 115;
    updateCamera();
  }

  function rebuild() {
    if (mode === '2d') {
      drawFallback();
      return;
    }
    if (!scene || !sceneModule || !state?.estimate) return;
    sceneModule.rebuildFenceMeshes({
      THREE,
      fenceGroup,
      fenceMaterials,
      geometry,
      cornerPoint,
      values: state.values,
      estimate: state.estimate,
    });
    statusEl.textContent = '3D · SW street-corner view';
    renderScene();
  }

  function applyBuildingMode() {
    if (sceneModule) {
      sceneModule.applyBuildingVisibilityMode(buildingMeshes, buildingMode);
    }
    syncBuildingControl();
    renderScene();
  }

  buildingCycleBtn.onclick = () => {
    buildingMode = NEXT_BUILDING_MODE[buildingMode];
    applyBuildingMode();
  };

  fitBtn.onclick = fit;
  fitBtn.textContent = 'SW view';

  zoomInBtn.onclick = () => {
    if (mode === '2d') {
      applyPlanZoom(1.25);
      return;
    }
    distance = Math.max(20, distance * 0.8);
    updateCamera();
  };

  zoomOutBtn.onclick = () => {
    if (mode === '2d') {
      applyPlanZoom(0.8);
      return;
    }
    distance = Math.min(600, distance * 1.25);
    updateCamera();
  };

  toggleBtn.onclick = () => {
    if (mode === '3d') {
      enterFallbackView('2D survey plan');
      toggleBtn.textContent = '3D';
    } else if (renderer) {
      setLayers('3d');
      toggleBtn.textContent = '2D';
      rebuild();
      fit();
    }
  };

  // 3D pointer & wheel navigation
  host.addEventListener(
    'pointerdown',
    (event) => {
      if (mode !== '3d') return;
      host.setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const pts = [...pointers.values()];
        pinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    },
    { signal }
  );

  host.addEventListener(
    'pointermove',
    (event) => {
      if (!pointers.has(event.pointerId) || mode !== '3d') return;
      const prev = pointers.get(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 1) {
        yaw -= (event.clientX - prev.x) * 0.007;
        pitch = Math.max(0.15, Math.min(1.4, pitch + (event.clientY - prev.y) * 0.007));
      } else {
        const pts = [...pointers.values()];
        const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (currentDist > 1 && pinchDistance > 1) {
          distance = Math.min(600, Math.max(20, (distance * pinchDistance) / currentDist));
        }
        pinchDistance = currentDist;
      }
      updateCamera();
    },
    { signal }
  );

  for (const eventType of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    host.addEventListener(
      eventType,
      (event) => {
        pointers.delete(event.pointerId);
      },
      { signal }
    );
  }

  host.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      distance = Math.max(20, Math.min(600, distance * Math.exp(event.deltaY * 0.001)));
      updateCamera();
    },
    { passive: false, signal }
  );

  // 2D plan pointer & wheel navigation
  fallbackEl.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      applyPlanZoom(Math.exp(-event.deltaY * 0.001));
    },
    { passive: false, signal }
  );

  fallbackEl.addEventListener(
    'pointerdown',
    (event) => {
      fallbackEl.setPointerCapture?.(event.pointerId);
      planPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (planPointers.size === 2) {
        const pts = [...planPointers.values()];
        planPinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      }
    },
    { signal }
  );

  fallbackEl.addEventListener(
    'pointermove',
    (event) => {
      if (!planPointers.has(event.pointerId)) return;
      const prev = planPointers.get(event.pointerId);
      planPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (planPointers.size === 2) {
        const pts = [...planPointers.values()];
        const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        if (currentDist > 1 && planPinchDistance > 1) {
          applyPlanZoom(currentDist / planPinchDistance);
        }
        planPinchDistance = currentDist;
      } else {
        const rect = fallbackEl.getBoundingClientRect();
        const scale = Math.max(420 / rect.width, 410 / rect.height) / planZoom;
        planCenter[0] -= (event.clientX - prev.x) * scale;
        planCenter[1] -= (event.clientY - prev.y) * scale;
        drawFallback();
      }
    },
    { signal }
  );

  for (const eventType of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    fallbackEl.addEventListener(
      eventType,
      (event) => {
        planPointers.delete(event.pointerId);
      },
      { signal }
    );
  }

  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (renderer && camera) {
            camera.aspect = viewerEl.clientWidth / viewerEl.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
          }
          if (mode === '2d') {
            drawFallback();
          } else {
            renderScene();
          }
        })
      : null;

  resizeObserver?.observe(viewerEl);

  async function init3D() {
    try {
      sceneModule = await loadSceneModule();
      THREE = sceneModule.THREE;

      const rendererFactory =
        createRenderer ||
        ((ThreeLib) => new ThreeLib.WebGLRenderer({ antialias: true, alpha: true }));
      renderer = rendererFactory(THREE);

      const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
      renderer.setPixelRatio(Math.min(dpr, 2));
      renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
      host.replaceChildren(renderer.domElement);

      setLayers('3d');
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(
        40,
        viewerEl.clientWidth / viewerEl.clientHeight,
        1,
        2000
      );
      target = new THREE.Vector3(houseCenter[0], 0, -houseCenter[1]);
      fenceGroup = new THREE.Group();
      scene.add(fenceGroup);

      const siteResult = sceneModule.addSiteToScene({
        THREE,
        scene,
        geometry,
        createStreetTexture: (ThreeLib, text) => createDomStreetTexture(doc, ThreeLib, text),
      });
      roadText = siteResult.roadText;
      disposeSite = siteResult.disposeSite;

      const buildingsResult = sceneModule.addBuildingsToScene({
        THREE,
        scene,
        geometry,
      });
      houseGroup = buildingsResult.house;
      shedGroup = buildingsResult.shed;
      buildingMeshes = buildingsResult.buildingMeshes;
      disposeBuildings = buildingsResult.disposeBuildings;

      renderer.domElement?.addEventListener?.(
        'webglcontextlost',
        (event) => {
          event.preventDefault();
          enterFallbackView('2D plan · graphics interrupted');
        },
        { signal }
      );

      fit();
      rebuild();
    } catch {
      enterFallbackView();
      toggleBtn.disabled = true;
      toggleBtn.textContent = '2D';
    }
  }

  const ready = init3D();

  return {
    ready,
    update(nextState) {
      state = nextState;
      rebuild();
    },
    fit,
    renderScene,
    getState() {
      return {
        mode,
        buildingMode,
        scene,
        camera,
        renderer,
        fenceGroup,
        houseGroup,
        shedGroup,
        roadText,
        buildingMeshes,
      };
    },
    destroy() {
      listenerController.abort();
      resizeObserver?.disconnect();
      if (sceneModule && fenceGroup) {
        sceneModule.clearFenceGroup(fenceGroup, fenceMaterials);
      }
      disposeBuildings?.();
      disposeSite?.();
      renderer?.dispose?.();
      toggleBtn.remove?.();
    },
  };
}
