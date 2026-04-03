import { type LocalProjectConfigExcludeTarget } from "./local-project-config.js";
import { createInstallCancelledError } from "./install-errors.js";
import type { LocalProjectConfigInspection } from "./local-project-config.js";
import type { TrackedLocalConfigAction } from "./prompts.js";
import type { InstallPaths, InstallScope } from "./settings-paths.js";

type LocalScopePaths = Pick<InstallPaths, "projectConfigPath" | "projectRoot">;

export interface UserScopeDetails {
  finalScope: "user";
  projectConfigPath?: never;
  switchedToUserScope: boolean;
  trustTargetPath?: never;
}

export interface LocalScopeDetails {
  finalScope: "local";
  projectConfigPath: string;
  switchedToUserScope: false;
  trustTargetPath: string;
}

export type ScopeDetails = UserScopeDetails | LocalScopeDetails;

export interface UserScopeResolution extends UserScopeDetails {
  localProjectConfigExcludeTarget?: never;
}

export interface LocalScopeResolution extends LocalScopeDetails {
  localProjectConfigExcludeTarget?: LocalProjectConfigExcludeTarget;
}

export type ScopeResolution = UserScopeResolution | LocalScopeResolution;

export interface ResolveInstallScopeInput {
  inspectLocalProjectConfig: (
    targetPath: string,
  ) => Promise<LocalProjectConfigInspection>;
  installPaths: LocalScopePaths;
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

      throw createInstallCancelledError();
    }
  }
}

export function createUserScopeDetails(
  switchedToUserScope: boolean,
): UserScopeDetails {
  return {
    finalScope: "user",
    switchedToUserScope,
  };
}

export function createLocalScopeDetails(
  installPaths: LocalScopePaths,
): LocalScopeDetails {
  return {
    finalScope: "local",
    projectConfigPath: installPaths.projectConfigPath,
    switchedToUserScope: false,
    trustTargetPath: installPaths.projectRoot,
  };
}

function createUserScopeResolution(
  switchedToUserScope: boolean,
): UserScopeResolution {
  return {
    ...createUserScopeDetails(switchedToUserScope),
  };
}

function createLocalScopeResolution(
  installPaths: LocalScopePaths,
  localProjectConfigExcludeTarget?: LocalProjectConfigExcludeTarget,
): LocalScopeResolution {
  return {
    ...createLocalScopeDetails(installPaths),
    ...(localProjectConfigExcludeTarget
      ? { localProjectConfigExcludeTarget }
      : {}),
  };
}
