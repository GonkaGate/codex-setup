import {
  type LocalProjectConfigExcludeTarget,
  type LocalProjectConfigInspection,
} from "./local-project-config.js";
import type { TrackedLocalConfigAction } from "./prompts.js";
import type { InstallPaths, InstallScope } from "./settings-paths.js";

export interface ScopeDetails {
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

function createUserScopeDetails(switchedToUserScope: boolean): ScopeDetails {
  return {
    finalScope: "user",
    switchedToUserScope,
  };
}

function createLocalScopeDetails(
  installPaths: Pick<InstallPaths, "projectConfigPath" | "projectRoot">,
): ScopeDetails {
  return {
    finalScope: "local",
    projectConfigPath: installPaths.projectConfigPath,
    switchedToUserScope: false,
    trustTargetPath: installPaths.projectRoot,
  };
}
