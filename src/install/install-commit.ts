import {
  InstallCommitError,
  type InstallRollbackFailure,
} from "./install-errors.js";
import { describeUnknownError } from "./error-codes.js";
import type {
  InstallWritePhase,
  ManagedWritePlan,
} from "./install-managed-writes.js";
import type { InstallCommitDependencies } from "./install-dependencies.js";
import type { PreparedInstallPlan } from "./install-state.js";
import type {
  ManagedWriteOptions,
  ManagedWriteResult,
} from "./write-managed-file.js";

export async function commitInstallPlan(
  installPlan: PreparedInstallPlan,
  dependencies: InstallCommitDependencies,
): Promise<ManagedWriteResult[]> {
  const writes: ManagedWriteResult[] = [];

  try {
    if (installPlan.context.localProjectConfigExcludeTarget) {
      // Only update .git/info/exclude once the rest of the install is ready.
      await dependencies.ensureLocalProjectConfigExcluded(
        installPlan.context.localProjectConfigExcludeTarget,
      );
    }

    for (const phase of installPlan.writePhases) {
      await commitManagedWritePhase(phase, dependencies, writes);
    }
  } catch (error) {
    const rollbackFailures = await rollbackCompletedWrites(
      writes,
      dependencies.rollbackManagedTextFile,
    );
    throw new InstallCommitError(error, writes, rollbackFailures);
  }

  return writes;
}

async function commitManagedWritePhase(
  phase: InstallWritePhase,
  dependencies: InstallCommitDependencies,
  completedWrites: ManagedWriteResult[],
): Promise<void> {
  for (const plannedWrite of phase.writes) {
    completedWrites.push(
      await dependencies.writeManagedTextFile(
        plannedWrite.filePath,
        plannedWrite.content,
        createManagedWriteOptions(plannedWrite, dependencies.createBackup),
      ),
    );
  }
}

function createManagedWriteOptions(
  plannedWrite: ManagedWritePlan,
  createBackupForWrite: InstallCommitDependencies["createBackup"],
): ManagedWriteOptions {
  return {
    backupFactory: createBackupForWrite,
    ...plannedWrite.writeOptions,
  };
}

async function rollbackCompletedWrites(
  completedWrites: readonly ManagedWriteResult[],
  rollbackWrite: InstallCommitDependencies["rollbackManagedTextFile"],
): Promise<InstallRollbackFailure[]> {
  const rollbackFailures: InstallRollbackFailure[] = [];

  for (const completedWrite of [...completedWrites].reverse()) {
    try {
      await rollbackWrite(completedWrite);
    } catch (error) {
      rollbackFailures.push({
        filePath: completedWrite.filePath,
        message: describeUnknownError(error),
      });
    }
  }

  return rollbackFailures;
}
