import { lstat } from "node:fs/promises";
import path from "node:path";
import { isMissingFileError } from "./error-codes.js";
import {
  type GitContext,
  findGitContext,
  requireRepoRelativePath,
} from "./git-context.js";

export interface RepositoryLocalProjectConfigLocation {
  gitContext: GitContext;
  relativeConfigPath: string;
}

export async function resolveRepositoryLocalProjectConfigLocation(
  projectConfigPath: string,
): Promise<RepositoryLocalProjectConfigLocation | null> {
  const gitContext = await findGitContext(path.dirname(projectConfigPath));
  await assertSafeProjectConfigPath(projectConfigPath, gitContext?.repoRoot);

  if (!gitContext) {
    return null;
  }

  return {
    gitContext,
    relativeConfigPath: requireRepoRelativePath(
      projectConfigPath,
      gitContext.repoRoot,
    ),
  };
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
  const relativeConfigPath = requireRepoRelativePath(
    projectConfigPath,
    repoRoot,
  );
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
