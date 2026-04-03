import { copyFile, lstat, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import writeFileAtomic from "write-file-atomic";
import {
  applyUnixMode,
  ensureDirectory,
  OWNER_READ_WRITE_MODE,
  OWNER_READ_WRITE_EXECUTE_MODE,
} from "./file-permissions.js";
import { isMissingFileError } from "./error-codes.js";

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
  const mode = options.mode ?? OWNER_READ_WRITE_MODE;
  await ensureDirectory(path.dirname(filePath), OWNER_READ_WRITE_EXECUTE_MODE);
  const existingFile = await readManagedTextFileState(filePath);
  const contentsMatch = contentsAreEqual(
    existingFile.text,
    content,
    options.contentComparator,
  );

  if (contentsMatch) {
    if (existingFile.exists) {
      await applyUnixMode(filePath, mode);
    }
    return {
      changed: false,
      filePath,
      previouslyExisted: existingFile.exists,
    };
  }

  const backupPath =
    existingFile.exists && options.backupFactory
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
    previouslyExisted: existingFile.exists,
  };
}

export async function rollbackManagedTextFile(
  write: ManagedWriteResult,
): Promise<void> {
  if (!write.changed) {
    return;
  }

  if (write.backupPath) {
    await assertSafeRollbackTarget(write.filePath);
    await copyFile(write.backupPath, write.filePath);
    const backupStats = await stat(write.backupPath);
    await applyUnixMode(write.filePath, backupStats.mode & 0o777);
    return;
  }

  if (!write.previouslyExisted) {
    await assertSafeRollbackTarget(write.filePath);
    await rm(write.filePath, {
      force: true,
    });
  }
}

interface ManagedTextFileState {
  exists: boolean;
  text: string;
}

function contentsAreEqual(
  currentText: string,
  nextText: string,
  contentComparator?: ManagedTextComparator,
): boolean {
  return contentComparator
    ? contentComparator(currentText, nextText)
    : currentText === nextText;
}

async function readManagedTextFileState(
  filePath: string,
): Promise<ManagedTextFileState> {
  try {
    const targetStats = await lstat(filePath);
    assertSafeManagedFileTarget(filePath, targetStats);

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

function assertSafeManagedFileTarget(
  filePath: string,
  targetStats: Awaited<ReturnType<typeof lstat>>,
): void {
  if (targetStats.isDirectory()) {
    throw new Error(`Refusing to overwrite directory ${filePath}.`);
  }

  if (targetStats.isSymbolicLink()) {
    throw new Error(`Refusing to overwrite symlink ${filePath}.`);
  }
}

async function assertSafeRollbackTarget(filePath: string): Promise<void> {
  try {
    const targetStats = await lstat(filePath);
    assertSafeManagedFileTarget(filePath, targetStats);
  } catch (error) {
    if (isMissingFileError(error)) {
      return;
    }

    throw error;
  }
}
