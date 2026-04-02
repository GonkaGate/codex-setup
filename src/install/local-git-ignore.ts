import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitContext {
  gitDir: string;
  repoRoot: string;
}

interface LocalProjectConfigGitContext {
  gitContext: GitContext | null;
  relativeTargetPath?: string;
}

export class TrackedLocalProjectConfigError extends Error {
  readonly relativeTargetPath: string;
  readonly repoRoot: string;

  constructor(relativeTargetPath: string, repoRoot: string) {
    super(
      `Refusing local install because ${relativeTargetPath} is already tracked by git.`,
    );
    this.name = "TrackedLocalProjectConfigError";
    this.relativeTargetPath = relativeTargetPath;
    this.repoRoot = repoRoot;
  }
}

export async function ensureLocalProjectConfigIgnored(
  targetPath: string,
): Promise<void> {
  const localConfigContext = await getLocalProjectConfigGitContext(targetPath);

  if (
    !localConfigContext.gitContext ||
    !localConfigContext.relativeTargetPath
  ) {
    return;
  }

  const { gitContext, relativeTargetPath } = localConfigContext;
  await assertTargetIsNotTracked(relativeTargetPath, gitContext.repoRoot);
  await ensureTargetIgnored(gitContext.gitDir, relativeTargetPath);
}

export async function findGitContext(
  startDirectory: string,
): Promise<GitContext | null> {
  let currentDirectory = path.resolve(startDirectory);

  for (;;) {
    const gitMarkerPath = path.join(currentDirectory, ".git");
    const gitDir = await resolveGitDir(gitMarkerPath, currentDirectory);

    if (gitDir) {
      return {
        gitDir,
        repoRoot: currentDirectory,
      };
    }

    const parentDirectory = path.dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return null;
    }

    currentDirectory = parentDirectory;
  }
}

async function getLocalProjectConfigGitContext(
  targetPath: string,
): Promise<LocalProjectConfigGitContext> {
  const gitContext = await findGitContext(path.dirname(targetPath));
  await assertSafeLocalProjectConfigTarget(targetPath, gitContext?.repoRoot);

  if (!gitContext) {
    return {
      gitContext: null,
    };
  }

  return {
    gitContext,
    relativeTargetPath: requireRepoRelativePath(
      targetPath,
      gitContext.repoRoot,
    ),
  };
}

async function ensureTargetIgnored(
  gitDir: string,
  relativeTargetPath: string,
): Promise<void> {
  const normalizedRelativePath = relativeTargetPath.split(path.sep).join("/");
  const ignoreEntries = [
    `/${normalizedRelativePath}`,
    `/${normalizedRelativePath}.backup-*`,
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

async function assertSafeLocalProjectConfigTarget(
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

function getPathsFromRepoRoot(repoRoot: string, targetPath: string): string[] {
  const relativeTargetPath = requireRepoRelativePath(targetPath, repoRoot);
  const targetSegments = relativeTargetPath
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

function requireRepoRelativePath(targetPath: string, repoRoot: string): string {
  const relativeTargetPath = path.relative(repoRoot, targetPath);

  if (
    relativeTargetPath.length === 0 ||
    relativeTargetPath.startsWith("..") ||
    path.isAbsolute(relativeTargetPath)
  ) {
    throw new Error(
      "Expected local Codex config to stay inside the current git repository.",
    );
  }

  return relativeTargetPath;
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

async function assertTargetIsNotTracked(
  relativeTargetPath: string,
  repoRoot: string,
): Promise<void> {
  try {
    await execFileAsync(
      "git",
      ["-C", repoRoot, "ls-files", "--error-unmatch", "--", relativeTargetPath],
      {
        encoding: "utf8",
      },
    );
    throw new TrackedLocalProjectConfigError(relativeTargetPath, repoRoot);
  } catch (error) {
    if (isMissingGitBinaryError(error)) {
      throw new Error(
        "Git is required to verify that .codex/config.toml is not already tracked before local install can continue.",
      );
    }

    if (isGitPathUnmatchedError(error)) {
      return;
    }

    throw error;
  }
}

async function resolveGitDir(
  gitMarkerPath: string,
  repoRoot: string,
): Promise<string | null> {
  try {
    const gitMarkerStats = await stat(gitMarkerPath);

    if (gitMarkerStats.isDirectory()) {
      return gitMarkerPath;
    }

    if (gitMarkerStats.isFile()) {
      const markerContent = await readFile(gitMarkerPath, "utf8");
      const match = /^gitdir:\s*(.+)\s*$/m.exec(markerContent);

      if (!match) {
        throw new Error(`Could not resolve gitdir from ${gitMarkerPath}.`);
      }

      return path.resolve(repoRoot, match[1]);
    }

    return null;
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
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

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isMissingGitBinaryError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isGitPathUnmatchedError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === 1;
}
