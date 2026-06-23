import type { ManagedWriteResult } from "./write-managed-file.js";

export interface InstallRollbackFailure {
  filePath: string;
  message: string;
}

export const INSTALL_CANCELLED_MESSAGE = "Installation cancelled.";

export class PromptError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PromptError";
    this.code = code;
  }
}

export function createInstallCancelledError(
  options?: ErrorOptions,
): PromptError {
  return new PromptError("cancelled", INSTALL_CANCELLED_MESSAGE, options);
}

export class InstallCommitError extends Error {
  readonly completedWrites: readonly ManagedWriteResult[];
  readonly rollbackFailures: readonly InstallRollbackFailure[];

  constructor(
    cause: unknown,
    completedWrites: ManagedWriteResult[],
    rollbackFailures: InstallRollbackFailure[],
  ) {
    super(
      formatInstallCommitMessage(
        completedWrites.length,
        rollbackFailures.length,
      ),
      cause instanceof Error ? { cause } : undefined,
    );
    this.name = "InstallCommitError";
    this.completedWrites = completedWrites;
    this.rollbackFailures = rollbackFailures;
  }
}

function formatInstallCommitMessage(
  completedWriteCount: number,
  rollbackFailureCount: number,
): string {
  const baseMessage =
    completedWriteCount === 0
      ? "Installation failed before any managed files were committed."
      : `Installation failed after ${completedWriteCount} managed file${completedWriteCount === 1 ? "" : "s"} were written.`;

  if (rollbackFailureCount === 0) {
    return `${baseMessage} Completed writes were rolled back.`;
  }

  return `${baseMessage} Rollback also failed for ${rollbackFailureCount} file${rollbackFailureCount === 1 ? "" : "s"}.`;
}
