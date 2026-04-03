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

type RepositoryLocalProjectConfigStatus =
  | { kind: "tracked" }
  | {
      ignoreTarget: LocalProjectConfigIgnoreTarget;
      kind: "untracked";
    };

type RepositoryLocalProjectConfigStatusKind =
  RepositoryLocalProjectConfigStatus["kind"];

export async function inspectLocalProjectConfig(
  projectConfigPath: string,
): Promise<LocalProjectConfigInspection> {
  const repositoryConfig =
    await resolveRepositoryLocalProjectConfigLocation(projectConfigPath);

  if (!repositoryConfig) {
    return {
      kind: "outside_repo",
    };
  }

  const status =
    await inspectRepositoryLocalProjectConfigStatus(repositoryConfig);

  if (status.kind === "tracked") {
    return {
      ...repositoryConfig,
      kind: "tracked",
    };
  }

  return {
    ...repositoryConfig,
    ignoreTarget: status.ignoreTarget,
    kind: "untracked",
  };
}

async function inspectRepositoryLocalProjectConfigStatus(
  repositoryConfig: RepositoryLocalProjectConfigLocation,
): Promise<RepositoryLocalProjectConfigStatus> {
  const kind = await getRepositoryLocalProjectConfigStatusKind(
    repositoryConfig.relativeConfigPath,
    repositoryConfig.gitContext.repoRoot,
  );

  if (kind === "tracked") {
    return {
      kind,
    };
  }

  return {
    ignoreTarget: {
      gitDir: repositoryConfig.gitContext.gitDir,
      relativeConfigPath: repositoryConfig.relativeConfigPath,
    },
    kind,
  };
}

async function getRepositoryLocalProjectConfigStatusKind(
  relativeConfigPath: string,
  repoRoot: string,
): Promise<RepositoryLocalProjectConfigStatusKind> {
  return (await isRepositoryPathTracked(relativeConfigPath, repoRoot))
    ? "tracked"
    : "untracked";
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
