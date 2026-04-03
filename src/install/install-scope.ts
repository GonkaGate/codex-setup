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
    repoRelativeConfigPath: string,
  ) => Promise<TrackedLocalConfigAction>;
  requestedScope: InstallScope;
}

export async function resolveInstallScope(
  input: ResolveInstallScopeInput,
): Promise<ScopeResolution> {
  if (input.requestedScope !== "local") {
    return createUserScopeResolution(false);
  }

  const projectConfigInspection = await input.inspectLocalProjectConfig(
    input.installPaths.projectConfigPath,
  );

  return resolveLocalScopeRequest(projectConfigInspection, input);
}

async function resolveLocalScopeRequest(
  projectConfigInspection: LocalProjectConfigInspection,
  input: ResolveInstallScopeInput,
): Promise<ScopeResolution> {
  switch (projectConfigInspection.kind) {
    case "outside_repo":
      return createLocalScopeResolution(input.installPaths);
    case "untracked":
      return createLocalScopeResolution(
        input.installPaths,
        projectConfigInspection.excludeTarget,
      );
    case "tracked": {
      const action = await input.promptForTrackedLocalConfigAction(
        projectConfigInspection.repoRelativeConfigPath,
      );

      if (action === "user") {
        return createUserScopeResolution(true);
      }

      throw new Error("Installation cancelled.");
    }
  }
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
    details: createUserScopeDetails(switchedToUserScope),
  };
}

function createLocalScopeResolution(
  installPaths: Pick<InstallPaths, "projectConfigPath" | "projectRoot">,
  localProjectConfigExcludeTarget?: LocalProjectConfigExcludeTarget,
): ScopeResolution {
  return {
    details: createLocalScopeDetails(installPaths),
    ...(localProjectConfigExcludeTarget
      ? { localProjectConfigExcludeTarget }
      : {}),
  };
}
