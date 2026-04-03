import { lstat } from "node:fs/promises";
import path from "node:path";
import { isMissingFileError } from "./error-codes.js";
import {
  type GitContext,
  findGitContext,
  requireRepoRelativePath,
} from "./git-context.js";

export interface RepositoryLocalProjectConfigTarget {
  gitContext: GitContext;
  relativeConfigPath: string;
}

export async function resolveRepositoryLocalProjectConfigTarget(
  targetPath: string,
): Promise<RepositoryLocalProjectConfigTarget | null> {
  const gitContext = await findGitContext(path.dirname(targetPath));
  await assertSafeLocalProjectConfigPath(targetPath, gitContext?.repoRoot);

  if (!gitContext) {
    return null;
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
