import {
  DEFAULT_MODEL,
  type SupportedModel,
} from "../../src/constants/models.js";
import {
  buildInstallArtifacts,
  type InstallArtifacts,
} from "../../src/install/install-artifacts.js";
import {
  createLocalScopeDetails,
  createUserScopeDetails,
} from "../../src/install/install-scope.js";
import {
  createInstallSummary,
  type PreparedInstallContext,
} from "../../src/install/install-state.js";
import {
  type InstallScope,
  type InstallPaths,
} from "../../src/install/settings-paths.js";
import type { TokenCommandConfig } from "../../src/install/token-helper.js";
import type { InstallOutcome } from "../../src/install/install-use-case.js";
import type {
  LoadedTomlConfig,
  TomlTable,
} from "../../src/install/toml-config.js";

export const DEFAULT_TEST_API_KEY = "gp-test-key-123456";
export const DEFAULT_TEST_CODEX_VERSION = "0.118.0";
export const TEST_PROJECT_ROOT = "/Users/test/project";
export const TEST_CODEX_HOME = "/Users/test/.codex";
export const TEST_NODE_EXECUTABLE = "/usr/bin/node";
export const TEST_PLATFORM = "linux";

interface TestInstallArtifactsOptions {
  codexHome?: string;
  environment?: NodeJS.ProcessEnv;
  nodeExecutable?: string;
  platform?: NodeJS.Platform;
  projectRoot?: string;
}

interface CommonPreparedInstallContextFields {
  codex: PreparedInstallContext["codex"];
  installPaths: InstallPaths;
  requestedScope: InstallScope;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

type UserPreparedInstallContext = Extract<
  PreparedInstallContext,
  { finalScope: "user" }
>;
type LocalPreparedInstallContext = Extract<
  PreparedInstallContext,
  { finalScope: "local" }
>;

type UserInstallOutcome = Extract<InstallOutcome, { finalScope: "user" }>;
type LocalInstallOutcome = Extract<InstallOutcome, { finalScope: "local" }>;

export function createTestCodexEnvironment(
  codexHome: string,
  environment: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  return {
    ...environment,
    CODEX_HOME: codexHome,
  };
}

export function createTestCodexAvailability(
  version = DEFAULT_TEST_CODEX_VERSION,
): UserInstallOutcome["codex"] {
  return {
    command: "codex",
    version,
  };
}

export function createTestInstallArtifacts(
  options: TestInstallArtifactsOptions = {},
): InstallArtifacts {
  const codexHome = options.codexHome ?? TEST_CODEX_HOME;

  return buildInstallArtifacts({
    environment: createTestCodexEnvironment(codexHome, options.environment),
    nodeExecutable: options.nodeExecutable ?? TEST_NODE_EXECUTABLE,
    platform: options.platform ?? TEST_PLATFORM,
    projectRoot: options.projectRoot ?? TEST_PROJECT_ROOT,
  });
}

export const TEST_INSTALL_ARTIFACTS: InstallArtifacts =
  createTestInstallArtifacts();

export const TEST_INSTALL_PATHS = TEST_INSTALL_ARTIFACTS.installPaths;

export const TEST_LOCAL_SCOPE_PATHS = {
  projectConfigPath: TEST_INSTALL_PATHS.projectConfigPath,
  projectRoot: TEST_INSTALL_PATHS.projectRoot,
} as const;

export const TEST_TOKEN_COMMAND = TEST_INSTALL_ARTIFACTS.tokenCommand;

function createCommonPreparedInstallContextFields(
  requestedScope: InstallScope,
  overrides: Partial<CommonPreparedInstallContextFields> = {},
): CommonPreparedInstallContextFields {
  return {
    codex: createTestCodexAvailability(),
    installPaths: TEST_INSTALL_PATHS,
    requestedScope,
    selectedModel: DEFAULT_MODEL,
    tokenCommand: TEST_TOKEN_COMMAND,
    ...overrides,
  };
}

function createUserPreparedInstallContext(
  overrides: Omit<Partial<UserInstallOutcome>, "writes"> = {},
): UserPreparedInstallContext {
  return {
    ...createCommonPreparedInstallContextFields(
      overrides.requestedScope ?? "user",
      {
        ...(overrides.codex ? { codex: overrides.codex } : {}),
        ...(overrides.requestedScope
          ? { requestedScope: overrides.requestedScope }
          : {}),
        ...(overrides.selectedModel
          ? { selectedModel: overrides.selectedModel }
          : {}),
      },
    ),
    ...createUserScopeDetails(overrides.switchedToUserScope ?? false),
  };
}

function createLocalPreparedInstallContext(
  overrides: Omit<Partial<LocalInstallOutcome>, "writes"> = {},
): LocalPreparedInstallContext {
  return {
    ...createCommonPreparedInstallContextFields(
      overrides.requestedScope ?? "local",
      {
        ...(overrides.codex ? { codex: overrides.codex } : {}),
        ...(overrides.requestedScope
          ? { requestedScope: overrides.requestedScope }
          : {}),
        ...(overrides.selectedModel
          ? { selectedModel: overrides.selectedModel }
          : {}),
      },
    ),
    ...createLocalScopeDetails(TEST_LOCAL_SCOPE_PATHS),
  };
}

export function createTestInstallOutcome(
  finalScope: "user",
  overrides?: Partial<UserInstallOutcome>,
): UserInstallOutcome;
export function createTestInstallOutcome(
  finalScope: "local",
  overrides?: Partial<LocalInstallOutcome>,
): LocalInstallOutcome;
export function createTestInstallOutcome(
  finalScope: "user" | "local",
  overrides: Partial<InstallOutcome> = {},
): InstallOutcome {
  if (finalScope === "user") {
    const userOverrides = overrides as Partial<UserInstallOutcome>;
    const { writes = [], ...summaryOverrides } = userOverrides;

    return {
      ...createInstallSummary(
        createUserPreparedInstallContext(summaryOverrides),
      ),
      ...summaryOverrides,
      writes,
    };
  }

  const localOverrides = overrides as Partial<LocalInstallOutcome>;
  const { writes = [], ...summaryOverrides } = localOverrides;

  return {
    ...createInstallSummary(
      createLocalPreparedInstallContext(summaryOverrides),
    ),
    ...summaryOverrides,
    writes,
  };
}

export function createLoadedTomlConfig(
  filePath: string,
  settings: TomlTable,
  overrides: Partial<Omit<LoadedTomlConfig, "filePath" | "settings">> = {},
): LoadedTomlConfig {
  return {
    exists: overrides.exists ?? true,
    filePath,
    settings,
    text: overrides.text ?? "",
  };
}
