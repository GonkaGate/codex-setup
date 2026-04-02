import { chmod, mkdir } from "node:fs/promises";

export const OWNER_READ_WRITE_MODE = 0o600;
export const OWNER_READ_WRITE_EXECUTE_MODE = 0o700;

export async function applyUnixMode(
  filePath: string,
  mode: number,
): Promise<void> {
  if (process.platform === "win32") {
    return;
  }

  await chmod(filePath, mode);
}

export async function ensureDirectory(
  directoryPath: string,
  mode = OWNER_READ_WRITE_EXECUTE_MODE,
): Promise<void> {
  await mkdir(directoryPath, {
    mode,
    recursive: true,
  });
  await applyUnixMode(directoryPath, mode);
}
