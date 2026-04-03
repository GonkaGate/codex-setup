import { type SupportedModelKey } from "../constants/models.js";
import {
  createInstallUseCaseDependencies,
  defaultInstallUseCaseDependencies,
  type InstallUseCaseDependencies,
} from "./install-dependencies.js";
import { commitInstallPlan } from "./install-commit.js";
import {
  prepareInstallPlan,
  summarizePreparedInstallContext,
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
  modelKey?: SupportedModelKey;
  scope?: InstallScope;
}

export interface InstallOutcome extends InstallSummary {
  writes: ManagedWriteResult[];
}

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
    ...summarizePreparedInstallContext(installPlan.context),
    writes,
  };
}
