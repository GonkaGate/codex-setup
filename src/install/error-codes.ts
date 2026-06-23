export function hasErrorCode(error: unknown, code: string | number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

export function isMissingFileError(error: unknown): boolean {
  return hasErrorCode(error, "ENOENT");
}

export function describeUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
