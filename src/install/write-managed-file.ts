import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import writeFileAtomic from "write-file-atomic";
import {
  applyUnixMode,
  ensureDirectory,
  OWNER_READ_WRITE_EXECUTE_MODE,
} from "./file-permissions.js";

export interface ManagedWriteOptions {
  backupFactory?: (filePath: string, mode?: number) => Promise<string>;
  mode?: number;
  skipBackupOnChange?: boolean;
}

export interface ManagedWriteResult {
  backupPath?: string;
  changed: boolean;
  filePath: string;
}

export async function writeManagedTextFile(
  filePath: string,
  content: string,
  options: ManagedWriteOptions = {},
): Promise<ManagedWriteResult> {
  const mode = options.mode ?? 0o600;
  await ensureDirectory(path.dirname(filePath), OWNER_READ_WRITE_EXECUTE_MODE);
  await assertSafeFileTarget(filePath);
  const currentText = await readOptionalFile(filePath);

  if (currentText === content) {
    await applyUnixMode(filePath, mode);
    return {
      changed: false,
      filePath,
    };
  }

  const backupPath =
    currentText.length > 0 &&
    options.backupFactory &&
    !options.skipBackupOnChange
      ? await options.backupFactory(filePath, mode)
      : undefined;

  await writeFileAtomic(filePath, content, {
    encoding: "utf8",
    mode,
  });
  await applyUnixMode(filePath, mode);

  return {
    backupPath,
    changed: true,
    filePath,
  };
}

async function assertSafeFileTarget(filePath: string): Promise<void> {
  try {
    const targetStats = await lstat(filePath);

    if (targetStats.isDirectory()) {
      throw new Error(`Refusing to overwrite directory ${filePath}.`);
    }

    if (targetStats.isSymbolicLink()) {
      throw new Error(`Refusing to overwrite symlink ${filePath}.`);
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
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

    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
