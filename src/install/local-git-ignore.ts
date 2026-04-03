import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { buildBackupGlob } from "./backup.js";
import { hasErrorCode, isMissingFileError } from "./error-codes.js";
import {
  type GitContext,
  findGitContext,
  requireRepoRelativePath,
} from "./git-context.js";

const execFileAsync = promisify(execFile);

// Local-scope protection for <project>/.codex/config.toml:
// inspect whether the config path is safe and tracked, then keep safe local
// files out of git when the installer proceeds with local scope.
export interface OutsideRepositoryLocalProjectConfigInspection {
  kind: "outside_repo";
}

export interface TrackedLocalProjectConfigInspection {
  gitContext: GitContext;
  kind: "tracked";
  relativeConfigPath: string;
}

export interface UntrackedLocalProjectConfigInspection {
  gitContext: GitContext;
  kind: "untracked";
  relativeConfigPath: string;
}

export type LocalProjectConfigInspection =
  | OutsideRepositoryLocalProjectConfigInspection
  | TrackedLocalProjectConfigInspection
  | UntrackedLocalProjectConfigInspection;

export async function inspectLocalProjectConfig(
  targetPath: string,
): Promise<LocalProjectConfigInspection> {
  const localConfigContext = await resolveLocalProjectConfigContext(targetPath);
  const { gitContext, relativeConfigPath } = localConfigContext;

  if (!gitContext || !relativeConfigPath) {
    return {
      kind: "outside_repo",
    };
  }

  const kind = (await isTrackedPath(relativeConfigPath, gitContext.repoRoot))
    ? "tracked"
    : "untracked";

  return {
    gitContext,
    kind,
    relativeConfigPath,
  };
}

export async function ensureLocalProjectConfigExcluded(
  configInspection: UntrackedLocalProjectConfigInspection,
): Promise<void> {
  await ensureConfigPathIgnored(
    configInspection.gitContext.gitDir,
    configInspection.relativeConfigPath,
  );
}

async function resolveLocalProjectConfigContext(targetPath: string): Promise<{
  gitContext: GitContext | null;
  relativeConfigPath?: string;
}> {
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

async function ensureConfigPathIgnored(
  gitDir: string,
  relativeConfigPath: string,
): Promise<void> {
  const normalizedRelativePath = relativeConfigPath.split(path.sep).join("/");
  const ignoreEntries = [
    `/${normalizedRelativePath}`,
    buildBackupGlob(`/${normalizedRelativePath}`),
  ];
  const excludePath = path.join(gitDir, "info", "exclude");
  const existingContent = await readOptionalFile(excludePath);
  const existingEntries = new Set(
    existingContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#")),
  );

  const missingEntries = ignoreEntries.filter(
    (ignoreEntry) => !existingEntries.has(ignoreEntry),
  );

  if (missingEntries.length === 0) {
    return;
  }

  await mkdir(path.dirname(excludePath), { recursive: true });

  const nextContent =
    existingContent.length === 0
      ? `${missingEntries.join("\n")}\n`
      : `${existingContent}${existingContent.endsWith("\n") ? "" : "\n"}${missingEntries.join("\n")}\n`;

  await writeFile(excludePath, nextContent, "utf8");
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

    if (isGitPathUnmatchedError(error)) {
      return false;
    }

    throw error;
  }
}

async function readOptionalFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return "";
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ${filePath}: ${message}`);
  }
}

function isGitPathUnmatchedError(error: unknown): boolean {
  return hasErrorCode(error, 1);
}
