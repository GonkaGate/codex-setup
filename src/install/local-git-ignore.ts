import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildBackupGlob } from "./backup.js";
import type { LocalProjectConfigIgnoreTarget } from "./local-project-config.js";
import { isMissingFileError } from "./error-codes.js";

export async function ensureLocalProjectConfigIgnored(
  ignoreTarget: LocalProjectConfigIgnoreTarget | undefined,
): Promise<void> {
  if (!ignoreTarget) {
    return;
  }

  await ensureConfigPathIgnoredInRepository(
    ignoreTarget.gitDir,
    ignoreTarget.relativeConfigPath,
  );
}

async function ensureConfigPathIgnoredInRepository(
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
