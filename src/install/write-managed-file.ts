import { copyFile, lstat, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import writeFileAtomic from "write-file-atomic";
import {
  applyUnixMode,
  ensureDirectory,
  OWNER_READ_WRITE_EXECUTE_MODE,
} from "./file-permissions.js";

export interface ManagedWriteOptions {
  backupFactory?: (filePath: string, mode?: number) => Promise<string>;
  contentComparator?: ManagedTextComparator;
  mode?: number;
}

export interface ManagedWriteResult {
  backupPath?: string;
  changed: boolean;
  filePath: string;
  previouslyExisted: boolean;
}

export type ManagedTextComparator = (
  currentContent: string,
  nextContent: string,
) => boolean;

export async function writeManagedTextFile(
  filePath: string,
  content: string,
  options: ManagedWriteOptions = {},
): Promise<ManagedWriteResult> {
  const mode = options.mode ?? 0o600;
  await ensureDirectory(path.dirname(filePath), OWNER_READ_WRITE_EXECUTE_MODE);
  const currentState = await readManagedTextFileState(filePath);
  const contentsMatch = options.contentComparator
    ? options.contentComparator(currentState.text, content)
    : currentState.text === content;

  if (contentsMatch) {
    if (currentState.exists) {
      await applyUnixMode(filePath, mode);
    }
    return {
      changed: false,
      filePath,
      previouslyExisted: currentState.exists,
    };
  }

  const backupPath =
    currentState.exists && options.backupFactory
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
    previouslyExisted: currentState.exists,
  };
}

export async function rollbackManagedTextFile(
  write: ManagedWriteResult,
): Promise<void> {
  if (!write.changed) {
    return;
  }

  if (write.backupPath) {
    await assertSafeFileTarget(write.filePath);
    await copyFile(write.backupPath, write.filePath);
    const backupStats = await stat(write.backupPath);
    await applyUnixMode(write.filePath, backupStats.mode & 0o777);
    return;
  }

  if (!write.previouslyExisted) {
    await assertSafeFileTarget(write.filePath);
    await rm(write.filePath, {
      force: true,
    });
  }
}

interface ManagedTextFileState {
  exists: boolean;
  text: string;
}

async function readManagedTextFileState(
  filePath: string,
): Promise<ManagedTextFileState> {
  try {
    const targetStats = await lstat(filePath);

    if (targetStats.isDirectory()) {
      throw new Error(`Refusing to overwrite directory ${filePath}.`);
    }

    if (targetStats.isSymbolicLink()) {
      throw new Error(`Refusing to overwrite symlink ${filePath}.`);
    }

    return {
      exists: true,
      text: await readFile(filePath, "utf8"),
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        exists: false,
        text: "",
      };
    }

    throw error;
  }
}

async function assertSafeFileTarget(filePath: string): Promise<void> {
  await readManagedTextFileState(filePath);
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
