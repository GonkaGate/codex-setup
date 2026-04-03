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
  finalScope: InstallScope;
  projectConfigPath?: string;
  switchedToUserScope: boolean;
  trustTargetPath?: string;
}

export interface ScopeResolution {
  configLayers: readonly ScopeConfigLayer[];
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
    return createUserScopeResolution(false);
  }

  const localProjectConfigInspection = await input.inspectLocalProjectConfig(
    input.installPaths.projectConfigPath,
  );

  switch (localProjectConfigInspection.kind) {
    case "outside_repo":
      return createLocalScopeResolution(input.installPaths);
    case "untracked":
      return createLocalScopeResolution(
        input.installPaths,
        localProjectConfigInspection.excludeTarget,
      );
    case "tracked": {
      const action = await input.promptForTrackedLocalConfigAction(
        localProjectConfigInspection.relativeConfigPath,
      );

      if (action === "user") {
        return createUserScopeResolution(true);
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

export function createUserScopeDetails(
  switchedToUserScope: boolean,
): ScopeDetails {
  return {
    finalScope: "user",
    switchedToUserScope,
  };
}

export function createLocalScopeDetails(
  installPaths: Pick<InstallPaths, "projectConfigPath" | "projectRoot">,
): ScopeDetails {
  return {
    finalScope: "local",
    projectConfigPath: installPaths.projectConfigPath,
    switchedToUserScope: false,
    trustTargetPath: installPaths.projectRoot,
  };
}

function createUserScopeResolution(
  switchedToUserScope: boolean,
): ScopeResolution {
  return {
    configLayers: getScopeConfigLayers("user"),
    details: createUserScopeDetails(switchedToUserScope),
  };
}

function createLocalScopeResolution(
  installPaths: Pick<InstallPaths, "projectConfigPath" | "projectRoot">,
  localProjectConfigExcludeTarget?: LocalProjectConfigExcludeTarget,
): ScopeResolution {
  return {
    configLayers: getScopeConfigLayers("local"),
    details: createLocalScopeDetails(installPaths),
    ...(localProjectConfigExcludeTarget
      ? { localProjectConfigExcludeTarget }
      : {}),
  };
}
