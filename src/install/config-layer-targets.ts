import type { InstallScope } from "./settings-paths.js";
import {
  getActivationConfigTarget as getActivationConfigTargetFromScope,
  getScopeConfigLayers,
  type ConfigLayerTarget,
} from "./install-scope.js";

// Compatibility view over the scope-owned config layer policy in install-scope.
export type { ConfigLayerTarget } from "./install-scope.js";

export interface ConfigLayerPlan {
  activationConfigTarget: ConfigLayerTarget;
  configLayerTargets: readonly ConfigLayerTarget[];
}

export function getConfigLayerTargets(
  scope: InstallScope,
): readonly ConfigLayerTarget[] {
  return getScopeConfigLayers(scope).map((layer) => layer.target);
}

export function usesProjectConfigTarget(
  configLayerTargets: readonly ConfigLayerTarget[],
): boolean {
  return configLayerTargets.includes("project");
}

export function getActivationConfigTarget(
  configLayerTargets: readonly ConfigLayerTarget[],
): ConfigLayerTarget {
  return usesProjectConfigTarget(configLayerTargets) ? "project" : "user";
}

export function createConfigLayerPlan(scope: InstallScope): ConfigLayerPlan {
  const configLayerTargets = getConfigLayerTargets(scope);

  return {
    activationConfigTarget: getActivationConfigTargetFromScope(
      getScopeConfigLayers(scope),
    ),
    configLayerTargets,
  };
}
