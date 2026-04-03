import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { hasErrorCode } from "./error-codes.js";
import type { GitContext } from "./git-context.js";
import {
  resolveRepositoryLocalProjectConfigLocation,
  type RepositoryLocalProjectConfigLocation,
} from "./local-project-config-target.js";

const execFileAsync = promisify(execFile);

export interface OutsideRepositoryLocalProjectConfigInspection {
  kind: "outside_repo";
}

export interface TrackedLocalProjectConfigInspection {
  gitContext: GitContext;
  kind: "tracked";
  relativeConfigPath: string;
}

export interface UntrackedLocalProjectConfigInspection {
  ignoreTarget: LocalProjectConfigIgnoreTarget;
  gitContext: GitContext;
  kind: "untracked";
  relativeConfigPath: string;
}

export interface LocalProjectConfigIgnoreTarget {
  gitDir: string;
  relativeConfigPath: string;
}

export type LocalProjectConfigInspection =
  | OutsideRepositoryLocalProjectConfigInspection
  | TrackedLocalProjectConfigInspection
  | UntrackedLocalProjectConfigInspection;

export async function inspectLocalProjectConfig(
  projectConfigPath: string,
): Promise<LocalProjectConfigInspection> {
  const localConfigLocation =
    await resolveRepositoryLocalProjectConfigLocation(projectConfigPath);

  if (!localConfigLocation) {
    return {
      kind: "outside_repo",
    };
  }

  const isTracked = await isRepositoryPathTracked(
    localConfigLocation.relativeConfigPath,
    localConfigLocation.gitContext.repoRoot,
  );

  if (isTracked) {
    return {
      ...localConfigLocation,
      kind: "tracked",
    };
  }

  return {
    ...localConfigLocation,
    ignoreTarget: buildLocalProjectConfigIgnoreTarget(localConfigLocation),
    kind: "untracked",
  };
}

function buildLocalProjectConfigIgnoreTarget(
  localConfigLocation: RepositoryLocalProjectConfigLocation,
): LocalProjectConfigIgnoreTarget {
  return {
    gitDir: localConfigLocation.gitContext.gitDir,
    relativeConfigPath: localConfigLocation.relativeConfigPath,
  };
}

async function isRepositoryPathTracked(
  relativeConfigPath: string,
  repoRoot: string,
): Promise<boolean> {
  try {
    await execFileAsync(
      "git",
      ["-C", repoRoot, "ls-files", "--error-unmatch", "--", relativeConfigPath],
      {
        encoding: "utf8",
      },
    );
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) {
      throw new Error(
        "Git is required to verify that .codex/config.toml is not already tracked before local install can continue.",
      );
    }

    if (hasErrorCode(error, 1)) {
      return false;
    }

    throw error;
  }
}
