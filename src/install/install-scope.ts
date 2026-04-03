import {
  type LocalProjectConfigExcludeTarget,
  type LocalProjectConfigInspection,
} from "./local-project-config.js";
import type { TrackedLocalConfigAction } from "./prompts.js";
import type { InstallPaths, InstallScope } from "./settings-paths.js";

export type ConfigLayerTarget = "user" | "project";
export type ConfigLayerRole = "activation" | "provider" | "trust";

export interface ScopeConfigLayer {
  roles: readonly ConfigLayerRole[];
  target: ConfigLayerTarget;
}

export interface ScopeDetails {
  configLayers: readonly ScopeConfigLayer[];
  finalScope: InstallScope;
  projectConfigPath?: string;
  switchedToUserScope: boolean;
  trustTargetPath?: string;
}

export interface ScopeResolution {
  details: ScopeDetails;
  localProjectConfigExcludeTarget?: LocalProjectConfigExcludeTarget;
}

export interface ResolveInstallScopeInput {
  inspectLocalProjectConfig: (
    targetPath: string,
  ) => Promise<LocalProjectConfigInspection>;
  installPaths: Pick<InstallPaths, "projectConfigPath" | "projectRoot">;
  promptForTrackedLocalConfigAction: (
    relativeConfigPath: string,
  ) => Promise<TrackedLocalConfigAction>;
  requestedScope: InstallScope;
}

const USER_SCOPE_CONFIG_LAYERS = [
  {
    roles: ["activation", "provider"],
    target: "user",
  },
] as const satisfies readonly ScopeConfigLayer[];

const LOCAL_SCOPE_CONFIG_LAYERS = [
  {
    roles: ["provider", "trust"],
    target: "user",
  },
  {
    roles: ["activation"],
    target: "project",
  },
] as const satisfies readonly ScopeConfigLayer[];

const CONFIG_LAYERS_BY_SCOPE = {
  local: LOCAL_SCOPE_CONFIG_LAYERS,
  user: USER_SCOPE_CONFIG_LAYERS,
} as const satisfies Record<InstallScope, readonly ScopeConfigLayer[]>;

export async function resolveInstallScope(
  input: ResolveInstallScopeInput,
): Promise<ScopeResolution> {
  if (input.requestedScope !== "local") {
    return {
      details: createUserScopeDetails(false),
    };
  }

  const localProjectConfigInspection = await input.inspectLocalProjectConfig(
    input.installPaths.projectConfigPath,
  );

  switch (localProjectConfigInspection.kind) {
    case "outside_repo":
      return {
        details: createLocalScopeDetails(input.installPaths),
      };
    case "untracked":
      return {
        details: createLocalScopeDetails(input.installPaths),
        localProjectConfigExcludeTarget:
          localProjectConfigInspection.excludeTarget,
      };
    case "tracked": {
      const action = await input.promptForTrackedLocalConfigAction(
        localProjectConfigInspection.relativeConfigPath,
      );

      if (action === "user") {
        return {
          details: createUserScopeDetails(true),
        };
      }

      throw new Error("Installation cancelled.");
    }
  }
}

export function getScopeConfigLayers(
  scope: InstallScope,
): readonly ScopeConfigLayer[] {
  return CONFIG_LAYERS_BY_SCOPE[scope];
}

export function hasProjectConfigLayer(
  configLayers: readonly ScopeConfigLayer[],
): boolean {
  return configLayers.some((layer) => layer.target === "project");
}

export function getActivationConfigTarget(
  configLayers: readonly ScopeConfigLayer[],
): ConfigLayerTarget {
  const activationLayer = configLayers.find((layer) =>
    layer.roles.includes("activation"),
  );

  if (!activationLayer) {
    throw new Error("Expected at least one activation config layer.");
  }

  return activationLayer.target;
}

export function createUserScopeDetails(
  switchedToUserScope: boolean,
): ScopeDetails {
  return {
    configLayers: getScopeConfigLayers("user"),
    finalScope: "user",
    switchedToUserScope,
  };
}

export function createLocalScopeDetails(
  installPaths: Pick<InstallPaths, "projectConfigPath" | "projectRoot">,
): ScopeDetails {
  return {
    configLayers: getScopeConfigLayers("local"),
    finalScope: "local",
    projectConfigPath: installPaths.projectConfigPath,
    switchedToUserScope: false,
    trustTargetPath: installPaths.projectRoot,
  };
}
