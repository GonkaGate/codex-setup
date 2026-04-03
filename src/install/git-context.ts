import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { isMissingFileError } from "./error-codes.js";

export interface GitContext {
  gitDir: string;
  repoRoot: string;
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

export function requireRepoRelativePath(
  targetPath: string,
  repoRoot: string,
): string {
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
