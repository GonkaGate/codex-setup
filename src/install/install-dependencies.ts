import { createBackup } from "./backup.js";
import { checkCodexAvailable } from "./codex-command.js";
import { ensureLocalProjectConfigExcluded } from "./local-git-ignore.js";
import { inspectLocalProjectConfig } from "./local-project-config.js";
import {
  promptForApiKey,
  promptForModel,
  promptForScope,
  promptForTrackedLocalConfigAction,
} from "./prompts.js";
import { loadTomlConfig } from "./toml-config.js";
import { validateApiKey } from "./validate-api-key.js";
import {
  rollbackManagedTextFile,
  writeManagedTextFile,
} from "./write-managed-file.js";

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
  ensureLocalProjectConfigExcluded: typeof ensureLocalProjectConfigExcluded;
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

const defaultInstallInputDependencies = {
  checkCodexAvailable,
  environment: process.env,
  inspectLocalProjectConfig,
  promptForApiKey,
  promptForModel,
  promptForScope,
  promptForTrackedLocalConfigAction,
  validateApiKey,
} satisfies InstallInputDependencies;

const defaultInstallPlanningDependencies = {
  loadTomlConfig,
  nodeExecutable: process.execPath,
  platform: process.platform,
} satisfies InstallPlanningDependencies;

const defaultInstallCommitDependencies = {
  createBackup,
  ensureLocalProjectConfigExcluded,
  rollbackManagedTextFile,
  writeManagedTextFile,
} satisfies InstallCommitDependencies;

export function createInstallUseCaseDependencies(
  overrides: InstallUseCaseDependencyOverrides = {},
): InstallUseCaseDependencies {
  return {
    commit: {
      ...defaultInstallCommitDependencies,
      ...overrides.commit,
    },
    input: {
      ...defaultInstallInputDependencies,
      ...overrides.input,
    },
    planning: {
      ...defaultInstallPlanningDependencies,
      ...overrides.planning,
    },
  };
}

export const defaultInstallUseCaseDependencies =
  createInstallUseCaseDependencies();
