import { DEFAULT_MODEL } from "../../src/constants/models.js";
import {
  resolveInstallPaths,
  type InstallPaths,
} from "../../src/install/settings-paths.js";
import {
  createTokenCommandConfig,
  type TokenCommandConfig,
} from "../../src/install/token-helper.js";
import {
  createInstallUseCaseDependencies,
  runInstallUseCase,
  type InstallOutcome,
  type InstallUseCaseDependencyOverrides,
  type InstallUseCaseDependencies,
} from "../../src/install/install-use-case.js";
import {
  DEFAULT_TEST_API_KEY,
  DEFAULT_TEST_CODEX_VERSION,
} from "./install-fixtures.js";
import { createTempWorkspace } from "./workspace.js";

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
  installPaths: InstallPaths;
  run: (options?: InstallScenarioRunOptions) => Promise<InstallOutcome>;
  tokenCommand: TokenCommandConfig;
  workspace: string;
}

function createInstallDependencyOverrides(options: InstallDependencyOptions) {
  return {
    input: {
      checkCodexAvailable: () => ({
        command: "codex",
        version: options.codexVersion ?? DEFAULT_TEST_CODEX_VERSION,
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
  const environment = {
    ...process.env,
    CODEX_HOME: codexHome,
  };
  const installPaths = resolveInstallPaths({
    environment,
    projectRoot: workspace,
  });
  const tokenCommand = createTokenCommandConfig({
    codexHome: installPaths.codexHome,
    nodeExecutable: process.execPath,
    platform: process.platform,
    tokenPath: installPaths.tokenPath,
  });

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
    installPaths,
    run,
    tokenCommand,
    workspace,
  };
}
