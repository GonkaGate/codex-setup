import { copyFile } from "node:fs/promises";
import { applyUnixMode, OWNER_READ_WRITE_MODE } from "./file-permissions.js";

function toBackupSuffix(timestamp = new Date()): string {
  return timestamp.toISOString().replace(/[:.]/g, "-");
}

export async function createBackup(
  filePath: string,
  mode = OWNER_READ_WRITE_MODE,
): Promise<string> {
  const backupPath = `${filePath}.backup-${toBackupSuffix()}`;
  await copyFile(filePath, backupPath);
  await applyUnixMode(backupPath, mode);
  return backupPath;
}
