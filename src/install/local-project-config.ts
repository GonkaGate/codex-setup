import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  findGitContext,
  requireRepoRelativePath,
  type GitContext,
} from "./git-context.js";
import { hasErrorCode, isMissingFileError } from "./error-codes.js";

const execFileAsync = promisify(execFile);

export interface OutsideRepositoryLocalProjectConfigInspection {
  kind: "outside_repo";
}

export interface TrackedLocalProjectConfigInspection {
  gitContext: GitContext;
  kind: "tracked";
  repoRelativeConfigPath: string;
}

export interface UntrackedLocalProjectConfigInspection {
  excludeTarget: LocalProjectConfigExcludeTarget;
  gitContext: GitContext;
  kind: "untracked";
  repoRelativeConfigPath: string;
}

export interface LocalProjectConfigExcludeTarget {
  gitDir: string;
  repoRelativeConfigPath: string;
}

export type LocalProjectConfigInspection =
  | OutsideRepositoryLocalProjectConfigInspection
  | TrackedLocalProjectConfigInspection
  | UntrackedLocalProjectConfigInspection;

export async function inspectLocalProjectConfig(
  projectConfigPath: string,
): Promise<LocalProjectConfigInspection> {
  const repoProjectConfigPath =
    await resolveRepositoryProjectConfigPath(projectConfigPath);

  if (!repoProjectConfigPath) {
    return {
      kind: "outside_repo",
    };
  }

  const trackedByGit = await isRepoPathTracked(
    repoProjectConfigPath.repoRelativeConfigPath,
    repoProjectConfigPath.gitContext.repoRoot,
  );

  if (trackedByGit) {
    return {
      ...repoProjectConfigPath,
      kind: "tracked",
    };
  }

  return {
    ...repoProjectConfigPath,
    excludeTarget: createLocalProjectConfigExcludeTarget(repoProjectConfigPath),
    kind: "untracked",
  };
}

interface RepositoryProjectConfigPath {
  gitContext: GitContext;
  repoRelativeConfigPath: string;
}

async function resolveRepositoryProjectConfigPath(
  projectConfigPath: string,
): Promise<RepositoryProjectConfigPath | null> {
  const gitContext = await findGitContext(path.dirname(projectConfigPath));
  await assertSafeProjectConfigPath(projectConfigPath, gitContext?.repoRoot);

  if (!gitContext) {
    return null;
  }

  return {
    gitContext,
    repoRelativeConfigPath: requireRepoRelativePath(
      projectConfigPath,
      gitContext.repoRoot,
    ),
  };
}

function createLocalProjectConfigExcludeTarget(
  repoProjectConfigPath: RepositoryProjectConfigPath,
): LocalProjectConfigExcludeTarget {
  return {
    gitDir: repoProjectConfigPath.gitContext.gitDir,
    repoRelativeConfigPath: repoProjectConfigPath.repoRelativeConfigPath,
  };
}

async function isRepoPathTracked(
  repoRelativeConfigPath: string,
  repoRoot: string,
): Promise<boolean> {
  try {
    await execFileAsync(
      "git",
      [
        "-C",
        repoRoot,
        "ls-files",
        "--error-unmatch",
        "--",
        repoRelativeConfigPath,
      ],
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

async function assertSafeProjectConfigPath(
  projectConfigPath: string,
  repoRoot?: string,
): Promise<void> {
  const pathsToInspect = repoRoot
    ? listPathsBetweenRepoRootAndConfig(repoRoot, projectConfigPath)
    : [path.dirname(projectConfigPath), projectConfigPath];

  for (const pathToInspect of pathsToInspect) {
    await assertPathIsNotSymlink(
      pathToInspect,
      buildSymlinkErrorMessage(pathToInspect, projectConfigPath, repoRoot),
    );
  }
}

async function assertPathIsNotSymlink(
  filePath: string,
  errorMessage: string,
): Promise<void> {
  try {
    const fileStats = await lstat(filePath);

    if (fileStats.isSymbolicLink()) {
      throw new Error(errorMessage);
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }

    throw error;
  }
}

// Walk every path component between the repo root and the config file so local
// scope cannot write through a symlinked intermediate directory.
function listPathsBetweenRepoRootAndConfig(
  repoRoot: string,
  projectConfigPath: string,
): string[] {
  const repoRelativeConfigPath = requireRepoRelativePath(
    projectConfigPath,
    repoRoot,
  );
  const targetSegments = repoRelativeConfigPath
    .split(path.sep)
    .filter((segment) => segment.length > 0);
  const pathsToInspect = [repoRoot];
  let currentPath = repoRoot;

  for (const segment of targetSegments) {
    currentPath = path.join(currentPath, segment);
    pathsToInspect.push(currentPath);
  }

  return pathsToInspect;
}

function buildSymlinkErrorMessage(
  pathToInspect: string,
  projectConfigPath: string,
  repoRoot?: string,
): string {
  if (pathToInspect === path.dirname(projectConfigPath)) {
    return 'Refusing to write local Codex config into a symlinked ".codex" directory.';
  }

  if (pathToInspect === projectConfigPath) {
    return "Refusing to overwrite local Codex config through a symlinked file.";
  }

  const label = repoRoot
    ? path.relative(repoRoot, pathToInspect) || path.basename(pathToInspect)
    : pathToInspect;
  return `Refusing local Codex setup through a symlinked path component: ${label}.`;
}
