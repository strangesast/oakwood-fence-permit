import * as THREE from 'three';
import { createElevationSampler, resolveFencePlanGeometry } from '../terrain.js';
import {
  addBuildingsToScene,
  applyBuildingVisibilityMode,
  getPorchRoofHeight,
} from './buildings.js';
import { clearFenceGroup, rebuildFenceMeshes } from './fence.js';
import { addSiteToScene, updateStreetTextOrientation } from './site.js';

export {
  THREE,
  addBuildingsToScene,
  applyBuildingVisibilityMode,
  getPorchRoofHeight,
  clearFenceGroup,
  rebuildFenceMeshes,
  addSiteToScene,
  updateStreetTextOrientation,
  createElevationSampler,
  resolveFencePlanGeometry,
};
