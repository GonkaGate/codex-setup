import { lstat } from "node:fs/promises";
import { isMissingFileError } from "./error-codes.js";

export interface ExistingPathTarget {
  exists: true;
  stats: Awaited<ReturnType<typeof lstat>>;
}

export interface MissingPathTarget {
  exists: false;
}

export type OptionalPathTarget = ExistingPathTarget | MissingPathTarget;

export async function inspectOptionalPathTarget(
  filePath: string,
): Promise<OptionalPathTarget> {
  try {
    return {
      exists: true,
      stats: await lstat(filePath),
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        exists: false,
      };
    }

    throw error;
  }
}

export function assertPathTargetIsNotSymlink(
  target: OptionalPathTarget,
  errorMessage: string,
): void {
  if (target.exists && target.stats.isSymbolicLink()) {
    throw new Error(errorMessage);
  }
}

export function assertSafeManagedWriteTarget(
  filePath: string,
  target: ExistingPathTarget,
): void {
  if (target.stats.isDirectory()) {
    throw new Error(`Refusing to overwrite directory ${filePath}.`);
  }

  if (target.stats.isSymbolicLink()) {
    throw new Error(`Refusing to overwrite symlink ${filePath}.`);
  }
}
