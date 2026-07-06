import {
  createInstallUseCaseDependencies,
  defaultInstallUseCaseDependencies,
  type InstallUseCaseDependencies,
} from "./install-dependencies.js";
import { commitInstallPlan } from "./install-commit.js";
import {
  createInstallSummary,
  prepareInstallPlan,
  type InstallSummary,
} from "./install-state.js";
import { type InstallScope } from "./settings-paths.js";
import { type ManagedWriteResult } from "./write-managed-file.js";

export { createInstallUseCaseDependencies, defaultInstallUseCaseDependencies };
export type {
  InstallCommitDependencies,
  InstallInputDependencies,
  InstallPlanningDependencies,
  InstallUseCaseDependencies,
  InstallUseCaseDependencyOverrides,
} from "./install-dependencies.js";

export interface InstallRequest {
  cwd: string;
  modelKey?: string;
  scope?: InstallScope;
}

export type InstallOutcome = InstallSummary & {
  writes: ManagedWriteResult[];
};

export async function runInstallUseCase(
  request: InstallRequest,
  dependencies: InstallUseCaseDependencies = defaultInstallUseCaseDependencies,
): Promise<InstallOutcome> {
  const installPlan = await prepareInstallPlan(
    request,
    dependencies.input,
    dependencies.planning,
  );
  const writes = await commitInstallPlan(installPlan, dependencies.commit);

  return {
    ...createInstallSummary(installPlan.context),
    writes,
  };
}
