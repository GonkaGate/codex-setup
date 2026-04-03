import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import {
  findGitContext,
  requireRepoRelativePath,
  type GitContext,
} from "./git-context.js";
import { LOCAL_PROJECT_CONFIG_RELATIVE_PATH } from "./settings-paths.js";
import {
  assertPathTargetIsNotSymlink,
  inspectOptionalPathTarget,
} from "./path-target-safety.js";
import { hasErrorCode } from "./error-codes.js";

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
  const repositoryConfigLocation =
    await findRepositoryProjectConfig(projectConfigPath);

  if (!repositoryConfigLocation) {
    return {
      kind: "outside_repo",
    };
  }

  return inspectRepositoryProjectConfig(repositoryConfigLocation);
}

interface RepositoryProjectConfigLocation {
  gitContext: GitContext;
  repoRelativeConfigPath: string;
}

async function findRepositoryProjectConfig(
  projectConfigPath: string,
): Promise<RepositoryProjectConfigLocation | null> {
  const gitContext = await findGitContext(path.dirname(projectConfigPath));
  await assertProjectConfigPathSafe(projectConfigPath, gitContext?.repoRoot);

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

async function inspectRepositoryProjectConfig(
  repositoryConfigLocation: RepositoryProjectConfigLocation,
): Promise<
  TrackedLocalProjectConfigInspection | UntrackedLocalProjectConfigInspection
> {
  return createRepositoryProjectConfigInspection(
    repositoryConfigLocation,
    await isRepoPathTracked(
      repositoryConfigLocation.repoRelativeConfigPath,
      repositoryConfigLocation.gitContext.repoRoot,
    ),
  );
}

function createRepositoryProjectConfigInspection(
  repositoryConfigLocation: RepositoryProjectConfigLocation,
  trackedByGit: boolean,
): TrackedLocalProjectConfigInspection | UntrackedLocalProjectConfigInspection {
  if (trackedByGit) {
    return {
      ...repositoryConfigLocation,
      kind: "tracked",
    };
  }

  return {
    ...repositoryConfigLocation,
    excludeTarget: {
      gitDir: repositoryConfigLocation.gitContext.gitDir,
      repoRelativeConfigPath: repositoryConfigLocation.repoRelativeConfigPath,
    },
    kind: "untracked",
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
        `Git is required to verify that ${LOCAL_PROJECT_CONFIG_RELATIVE_PATH} is not already tracked before local install can continue.`,
      );
    }

    if (hasErrorCode(error, 1)) {
      return false;
    }

    throw error;
  }
}

async function assertProjectConfigPathSafe(
  projectConfigPath: string,
  repoRoot?: string,
): Promise<void> {
  const pathsToInspect = repoRoot
    ? listProjectConfigPathsToInspect(repoRoot, projectConfigPath)
    : [path.dirname(projectConfigPath), projectConfigPath];

  for (const inspectedPath of pathsToInspect) {
    await assertPathIsNotSymlink(
      inspectedPath,
      buildSymlinkErrorMessage(inspectedPath, projectConfigPath, repoRoot),
    );
  }
}

async function assertPathIsNotSymlink(
  filePath: string,
  errorMessage: string,
): Promise<void> {
  assertPathTargetIsNotSymlink(
    await inspectOptionalPathTarget(filePath),
    errorMessage,
  );
}

// Walk every path component between the repo root and the config file so local
// scope cannot write through a symlinked intermediate directory.
function listProjectConfigPathsToInspect(
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
  inspectedPath: string,
  projectConfigPath: string,
  repoRoot?: string,
): string {
  if (inspectedPath === path.dirname(projectConfigPath)) {
    return 'Refusing to write local Codex config into a symlinked ".codex" directory.';
  }

  if (inspectedPath === projectConfigPath) {
    return "Refusing to overwrite local Codex config through a symlinked file.";
  }

  const label = repoRoot
    ? path.relative(repoRoot, inspectedPath) || path.basename(inspectedPath)
    : inspectedPath;
  return `Refusing local Codex setup through a symlinked path component: ${label}.`;
}
