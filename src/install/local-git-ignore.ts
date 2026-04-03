import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildBackupGlob } from "./backup.js";
import type { LocalProjectConfigExcludeTarget } from "./local-project-config.js";
import { describeUnknownError, isMissingFileError } from "./error-codes.js";

export async function ensureLocalProjectConfigExcluded(
  excludeTarget: LocalProjectConfigExcludeTarget | undefined,
): Promise<void> {
  if (!excludeTarget) {
    return;
  }

  await ensureRepoPathExcluded(
    excludeTarget.gitDir,
    excludeTarget.repoRelativeConfigPath,
  );
}

async function ensureRepoPathExcluded(
  gitDir: string,
  repoRelativeConfigPath: string,
): Promise<void> {
  const normalizedRepoRelativePath = repoRelativeConfigPath
    .split(path.sep)
    .join("/");
  const entriesToEnsure = [
    `/${normalizedRepoRelativePath}`,
    buildBackupGlob(`/${normalizedRepoRelativePath}`),
  ];
  const excludePath = path.join(gitDir, "info", "exclude");
  const existingContent = await readOptionalFile(excludePath);
  const existingEntries = new Set(
    existingContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#")),
  );

  const missingEntries = entriesToEnsure.filter(
    (ignoreEntry) => !existingEntries.has(ignoreEntry),
  );

  if (missingEntries.length === 0) {
    return;
  }

  await mkdir(path.dirname(excludePath), { recursive: true });
  await writeFile(
    excludePath,
    appendIgnoreEntries(existingContent, missingEntries),
    "utf8",
  );
}

async function readOptionalFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return "";
    }

    throw new Error(
      `Failed to read ${filePath}: ${describeUnknownError(error)}`,
    );
  }
}

function appendIgnoreEntries(
  existingContent: string,
  entries: readonly string[],
): string {
  if (existingContent.length === 0) {
    return `${entries.join("\n")}\n`;
  }

  const separator = existingContent.endsWith("\n") ? "" : "\n";
  return `${existingContent}${separator}${entries.join("\n")}\n`;
}
