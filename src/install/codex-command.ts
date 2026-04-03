import { spawnSync } from "node:child_process";
import { VERIFIED_CODEX_MIN_VERSION } from "../constants/gateway.js";
import { hasErrorCode } from "./error-codes.js";

export interface CodexAvailability {
  command: string;
  version: string;
}

export class CodexCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CodexCommandError";
  }
}

export function parseCodexVersion(output: string): string | undefined {
  return output.match(/\b\d+\.\d+\.\d+\b/)?.[0];
}

export function compareSemver(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number(part));
  const rightParts = right.split(".").map((part) => Number(part));
  const longestLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < longestLength; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;

    if (leftPart > rightPart) {
      return 1;
    }

    if (leftPart < rightPart) {
      return -1;
    }
  }

  return 0;
}

export function checkCodexAvailable(
  command = "codex",
  minimumVersion = VERIFIED_CODEX_MIN_VERSION,
): CodexAvailability {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
  });

  if (result.error) {
    if (hasErrorCode(result.error, "ENOENT")) {
      throw new CodexCommandError(
        `Could not find the "codex" command in PATH. Install Codex CLI first, then rerun ${command}.`,
      );
    }

    throw new CodexCommandError(
      `Failed to execute "${command} --version": ${result.error.message}`,
    );
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    throw new CodexCommandError(
      stderr.length > 0
        ? `The "codex" command failed: ${stderr}`
        : 'The "codex" command failed before installation could continue.',
    );
  }

  const rawOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const version = parseCodexVersion(rawOutput);

  if (!version) {
    throw new CodexCommandError(
      `Could not parse a Codex version from "${rawOutput.trim()}".`,
    );
  }

  if (compareSemver(version, minimumVersion) < 0) {
    throw new CodexCommandError(
      `Codex CLI ${version} is too old. This installer requires ${minimumVersion} or newer because it relies on custom-provider auth and model catalogs.`,
    );
  }

  return {
    command,
    version,
  };
}
