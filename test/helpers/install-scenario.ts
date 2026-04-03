import { DEFAULT_MODEL } from "../../src/constants/models.js";
import {
  createInstallUseCaseDependencies,
  runInstallUseCase,
  type InstallOutcome,
  type InstallUseCaseDependencyOverrides,
  type InstallUseCaseDependencies,
} from "../../src/install/install-use-case.js";
import { createTempWorkspace } from "./workspace.js";

export const DEFAULT_TEST_API_KEY = "gp-test-key-123456";
const DEFAULT_CODEX_VERSION = "0.118.0";

interface InstallDependencyOptions {
  apiKey?: string;
  codexHome: string;
  codexVersion?: string;
  promptScope: "user" | "local";
  trackedLocalAction?: "user" | "cancel";
}

export interface InstallScenarioOptions {
  apiKey?: string;
  codexVersion?: string;
  scope: "user" | "local";
  trackedLocalAction?: "user" | "cancel";
}

export interface InstallScenarioRunOptions {
  cwd?: string;
  dependencies?: InstallUseCaseDependencies;
  scope?: "user" | "local";
}

export interface InstallScenario {
  codexHome: string;
  createDependencies: (
    overrides?: InstallUseCaseDependencyOverrides,
  ) => InstallUseCaseDependencies;
  run: (options?: InstallScenarioRunOptions) => Promise<InstallOutcome>;
  workspace: string;
}

function createInstallDependencyOverrides(options: InstallDependencyOptions) {
  return {
    input: {
      checkCodexAvailable: () => ({
        command: "codex",
        version: options.codexVersion ?? DEFAULT_CODEX_VERSION,
      }),
      environment: {
        ...process.env,
        CODEX_HOME: options.codexHome,
      },
      promptForApiKey: async () => options.apiKey ?? DEFAULT_TEST_API_KEY,
      promptForModel: async () => DEFAULT_MODEL,
      promptForScope: async () => options.promptScope,
      promptForTrackedLocalConfigAction: async () =>
        options.trackedLocalAction ?? "cancel",
    },
  };
}

export async function createInstallScenario(
  name: string,
  options: InstallScenarioOptions,
): Promise<InstallScenario> {
  const workspace = await createTempWorkspace(`codex-setup-${name}-workspace`);
  const codexHome = await createTempWorkspace(`codex-setup-${name}-home`);

  const createDependencies = (
    overrides: InstallUseCaseDependencyOverrides = {},
  ): InstallUseCaseDependencies =>
    createInstallUseCaseDependencies({
      commit: overrides.commit,
      input: {
        ...createInstallDependencyOverrides({
          apiKey: options.apiKey,
          codexHome,
          codexVersion: options.codexVersion,
          promptScope: options.scope,
          trackedLocalAction: options.trackedLocalAction,
        }).input,
        ...overrides.input,
      },
      planning: overrides.planning,
    });

  const run = async (
    runOptions: InstallScenarioRunOptions = {},
  ): Promise<InstallOutcome> => {
    const dependencies = runOptions.dependencies ?? createDependencies();
    return runInstallUseCase(
      {
        cwd: runOptions.cwd ?? workspace,
        scope: runOptions.scope ?? options.scope,
      },
      dependencies,
    );
  };

  return {
    codexHome,
    createDependencies,
    run,
    workspace,
  };
}
