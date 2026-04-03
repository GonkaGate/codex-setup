import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { hasErrorCode } from "./error-codes.js";
import type { GitContext } from "./git-context.js";
import {
  resolveRepositoryLocalProjectConfigTarget,
  type RepositoryLocalProjectConfigTarget,
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
  excludeTarget: LocalProjectConfigExcludeTarget;
  gitContext: GitContext;
  kind: "untracked";
  relativeConfigPath: string;
}

export interface LocalProjectConfigExcludeTarget {
  gitDir: string;
  relativeConfigPath: string;
}

export type LocalProjectConfigInspection =
  | OutsideRepositoryLocalProjectConfigInspection
  | TrackedLocalProjectConfigInspection
  | UntrackedLocalProjectConfigInspection;

type RepositoryLocalProjectConfigTracking =
  | { kind: "tracked" }
  | {
      excludeTarget: LocalProjectConfigExcludeTarget;
      kind: "untracked";
    };

type LocalProjectConfigTrackingKind =
  RepositoryLocalProjectConfigTracking["kind"];

export async function inspectLocalProjectConfig(
  targetPath: string,
): Promise<LocalProjectConfigInspection> {
  const repositoryTarget =
    await resolveRepositoryLocalProjectConfigTarget(targetPath);

  if (!repositoryTarget) {
    return {
      kind: "outside_repo",
    };
  }

  const tracking =
    await inspectRepositoryLocalProjectConfigTracking(repositoryTarget);

  return createRepositoryConfigInspection(repositoryTarget, tracking);
}

function createRepositoryConfigInspection(
  target: RepositoryLocalProjectConfigTarget,
  tracking: RepositoryLocalProjectConfigTracking,
): TrackedLocalProjectConfigInspection | UntrackedLocalProjectConfigInspection {
  if (tracking.kind === "tracked") {
    return {
      ...target,
      kind: "tracked",
    };
  }

  return {
    ...target,
    excludeTarget: tracking.excludeTarget,
    kind: "untracked",
  };
}

async function inspectRepositoryLocalProjectConfigTracking(
  target: RepositoryLocalProjectConfigTarget,
): Promise<RepositoryLocalProjectConfigTracking> {
  const kind = await getLocalProjectConfigTrackingKind(
    target.relativeConfigPath,
    target.gitContext.repoRoot,
  );

  if (kind === "tracked") {
    return {
      kind,
    };
  }

  return {
    excludeTarget: {
      gitDir: target.gitContext.gitDir,
      relativeConfigPath: target.relativeConfigPath,
    },
    kind,
  };
}

async function getLocalProjectConfigTrackingKind(
  relativeConfigPath: string,
  repoRoot: string,
): Promise<LocalProjectConfigTrackingKind> {
  return (await isTrackedPath(relativeConfigPath, repoRoot))
    ? "tracked"
    : "untracked";
}

async function isTrackedPath(
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
