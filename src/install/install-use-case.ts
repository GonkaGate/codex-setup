import { type SupportedModelKey } from "../constants/models.js";
import { createBackup } from "./backup.js";
import { checkCodexAvailable } from "./codex-command.js";
import { loadTomlConfig } from "./toml-config.js";
import { inspectLocalProjectConfig } from "./local-project-config.js";
import { ensureLocalProjectConfigIgnored } from "./local-git-ignore.js";
import { commitInstallPlan } from "./install-commit.js";
import { prepareInstallPlan, type InstallSummary } from "./install-state.js";
import {
  promptForApiKey,
  promptForModel,
  promptForScope,
  promptForTrackedLocalConfigAction,
} from "./prompts.js";
import { type InstallScope } from "./settings-paths.js";
import { validateApiKey } from "./validate-api-key.js";
import {
  rollbackManagedTextFile,
  writeManagedTextFile,
  type ManagedWriteResult,
} from "./write-managed-file.js";

export interface InstallRequest {
  cwd: string;
  modelKey?: SupportedModelKey;
  scope?: InstallScope;
}

export interface InstallOutcome extends InstallSummary {
  writes: ManagedWriteResult[];
}

export interface InstallInputDependencies {
  checkCodexAvailable: typeof checkCodexAvailable;
  environment: NodeJS.ProcessEnv;
  inspectLocalProjectConfig: typeof inspectLocalProjectConfig;
  promptForApiKey: typeof promptForApiKey;
  promptForModel: typeof promptForModel;
  promptForScope: typeof promptForScope;
  promptForTrackedLocalConfigAction: typeof promptForTrackedLocalConfigAction;
  validateApiKey: typeof validateApiKey;
}

export interface InstallPlanningDependencies {
  loadTomlConfig: typeof loadTomlConfig;
  nodeExecutable: string;
  platform: NodeJS.Platform;
}

export interface InstallCommitDependencies {
  createBackup: typeof createBackup;
  ensureLocalProjectConfigIgnored: typeof ensureLocalProjectConfigIgnored;
  rollbackManagedTextFile: typeof rollbackManagedTextFile;
  writeManagedTextFile: typeof writeManagedTextFile;
}

export interface InstallUseCaseDependencies {
  commit: InstallCommitDependencies;
  input: InstallInputDependencies;
  planning: InstallPlanningDependencies;
}

export interface InstallUseCaseDependencyOverrides {
  commit?: Partial<InstallCommitDependencies>;
  input?: Partial<InstallInputDependencies>;
  planning?: Partial<InstallPlanningDependencies>;
}

const baseInstallInputDependencies = {
  checkCodexAvailable,
  environment: process.env,
  inspectLocalProjectConfig,
  promptForApiKey,
  promptForModel,
  promptForScope,
  promptForTrackedLocalConfigAction,
  validateApiKey,
} satisfies InstallInputDependencies;

const baseInstallPlanningDependencies = {
  loadTomlConfig,
  nodeExecutable: process.execPath,
  platform: process.platform,
} satisfies InstallPlanningDependencies;

const baseInstallCommitDependencies = {
  createBackup,
  ensureLocalProjectConfigIgnored,
  rollbackManagedTextFile,
  writeManagedTextFile,
} satisfies InstallCommitDependencies;

export function createInstallUseCaseDependencies(
  overrides: InstallUseCaseDependencyOverrides = {},
): InstallUseCaseDependencies {
  return {
    commit: {
      ...baseInstallCommitDependencies,
      ...overrides.commit,
    },
    input: {
      ...baseInstallInputDependencies,
      ...overrides.input,
    },
    planning: {
      ...baseInstallPlanningDependencies,
      ...overrides.planning,
    },
  };
}

export const defaultInstallUseCaseDependencies =
  createInstallUseCaseDependencies();

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
    ...installPlan.state.summary,
    writes,
  };
}
