import { copyFile } from "node:fs/promises";
import { applyUnixMode, OWNER_READ_WRITE_MODE } from "./file-permissions.js";

export const MANAGED_BACKUP_SUFFIX_PREFIX = ".backup-";

function toBackupSuffix(timestamp = new Date()): string {
  return timestamp.toISOString().replace(/[:.]/g, "-");
}

export function buildBackupPath(
  filePath: string,
  timestamp = new Date(),
): string {
  return `${filePath}${MANAGED_BACKUP_SUFFIX_PREFIX}${toBackupSuffix(timestamp)}`;
}

export function buildBackupGlob(filePath: string): string {
  return `${filePath}${MANAGED_BACKUP_SUFFIX_PREFIX}*`;
}

export async function createBackup(
  filePath: string,
  mode = OWNER_READ_WRITE_MODE,
): Promise<string> {
  const backupPath = buildBackupPath(filePath);
  await copyFile(filePath, backupPath);
  await applyUnixMode(backupPath, mode);
  return backupPath;
}
