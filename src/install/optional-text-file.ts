import { readFile } from "node:fs/promises";
import { isMissingFileError } from "./error-codes.js";

export async function readOptionalTextFile(
  filePath: string,
): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw error;
  }
}
