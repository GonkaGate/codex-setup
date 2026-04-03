import {
  InstallCommitError,
  type InstallRollbackFailure,
} from "./install-errors.js";
import type {
  PlannedManagedWrite,
  PlannedManagedWritePhase,
} from "./install-managed-writes.js";
import type { PreparedInstallPlan } from "./install-state.js";
import type { InstallCommitDependencies } from "./install-use-case.js";
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
    if (installPlan.state.localProjectConfigExcludeTarget) {
      // Keep the repo-local config ignored only once the install is ready to commit.
      await dependencies.ensureLocalProjectConfigExcluded(
        installPlan.state.localProjectConfigExcludeTarget,
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
  phase: PlannedManagedWritePhase,
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
  plannedWrite: PlannedManagedWrite,
  createBackupForWrite: InstallCommitDependencies["createBackup"],
): ManagedWriteOptions {
  return {
    backupFactory: createBackupForWrite,
    contentComparator: plannedWrite.contentComparator,
    mode: plannedWrite.mode,
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
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return rollbackFailures;
}
