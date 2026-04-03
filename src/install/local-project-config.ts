import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { hasErrorCode, isMissingFileError } from "./error-codes.js";
import {
  type GitContext,
  findGitContext,
  requireRepoRelativePath,
} from "./git-context.js";

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

export async function inspectLocalProjectConfig(
  targetPath: string,
): Promise<LocalProjectConfigInspection> {
  const localConfigTarget = await resolveLocalProjectConfigTarget(targetPath);
  const { gitContext, relativeConfigPath } = localConfigTarget;

  if (!gitContext || !relativeConfigPath) {
    return {
      kind: "outside_repo",
    };
  }

  return createRepositoryConfigInspection(gitContext, relativeConfigPath);
}

async function createRepositoryConfigInspection(
  gitContext: GitContext,
  relativeConfigPath: string,
): Promise<
  TrackedLocalProjectConfigInspection | UntrackedLocalProjectConfigInspection
> {
  const kind = await getLocalProjectConfigTrackingKind(
    relativeConfigPath,
    gitContext.repoRoot,
  );

  if (kind === "tracked") {
    return {
      gitContext,
      kind,
      relativeConfigPath,
    };
  }

  return {
    excludeTarget: {
      gitDir: gitContext.gitDir,
      relativeConfigPath,
    },
    gitContext,
    kind,
    relativeConfigPath,
  };
}

interface LocalProjectConfigTarget {
  gitContext: GitContext | null;
  relativeConfigPath?: string;
}

type LocalProjectConfigTrackingKind = "tracked" | "untracked";

async function resolveLocalProjectConfigTarget(
  targetPath: string,
): Promise<LocalProjectConfigTarget> {
  const gitContext = await findGitContext(path.dirname(targetPath));
  await assertSafeLocalProjectConfigPath(targetPath, gitContext?.repoRoot);

  if (!gitContext) {
    return {
      gitContext: null,
    };
  }

  return {
    gitContext,
    relativeConfigPath: requireRepoRelativePath(
      targetPath,
      gitContext.repoRoot,
    ),
  };
}

async function assertSafeLocalProjectConfigPath(
  targetPath: string,
  repoRoot?: string,
): Promise<void> {
  const pathsToInspect = repoRoot
    ? getPathsFromRepoRoot(repoRoot, targetPath)
    : [path.dirname(targetPath), targetPath];

  for (const currentPath of pathsToInspect) {
    await assertPathIsNotSymlink(
      currentPath,
      getSymlinkErrorMessage(currentPath, targetPath, repoRoot),
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

// Walk every path component between the repo root and the config file so local
// scope cannot write through a symlinked intermediate directory.
function getPathsFromRepoRoot(repoRoot: string, targetPath: string): string[] {
  const relativeConfigPath = requireRepoRelativePath(targetPath, repoRoot);
  const targetSegments = relativeConfigPath
    .split(path.sep)
    .filter((segment) => segment.length > 0);
  const paths = [repoRoot];
  let currentPath = repoRoot;

  for (const segment of targetSegments) {
    currentPath = path.join(currentPath, segment);
    paths.push(currentPath);
  }

  return paths;
}

function getSymlinkErrorMessage(
  currentPath: string,
  targetPath: string,
  repoRoot?: string,
): string {
  if (currentPath === path.dirname(targetPath)) {
    return 'Refusing to write local Codex config into a symlinked ".codex" directory.';
  }

  if (currentPath === targetPath) {
    return "Refusing to overwrite local Codex config through a symlinked file.";
  }

  const label = repoRoot
    ? path.relative(repoRoot, currentPath) || path.basename(currentPath)
    : currentPath;
  return `Refusing local Codex setup through a symlinked path component: ${label}.`;
}
