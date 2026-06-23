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
  apiKey: string;
  codex: PreparedInstallContext["codex"];
  installPaths: InstallPaths;
  requestedScope: InstallScope;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

interface CommonInstallSummaryOverrides {
  codex?: InstallOutcome["codex"];
  requestedScope?: InstallScope;
  selectedModel?: SupportedModel;
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
  defaultRequestedScope: InstallScope,
  overrides: CommonInstallSummaryOverrides = {},
): CommonPreparedInstallContextFields {
  return {
    apiKey: DEFAULT_TEST_API_KEY,
    codex: overrides.codex ?? createTestCodexAvailability(),
    installPaths: TEST_INSTALL_PATHS,
    requestedScope: overrides.requestedScope ?? defaultRequestedScope,
    selectedModel: overrides.selectedModel ?? DEFAULT_MODEL,
    tokenCommand: TEST_TOKEN_COMMAND,
  };
}

type UserInstallSummaryOverrides = Omit<Partial<UserInstallOutcome>, "writes">;
type LocalInstallSummaryOverrides = Omit<
  Partial<LocalInstallOutcome>,
  "writes"
>;

function createPreparedInstallContextForScope(
  finalScope: "user",
  overrides?: UserInstallSummaryOverrides,
): UserPreparedInstallContext;
function createPreparedInstallContextForScope(
  finalScope: "local",
  overrides?: LocalInstallSummaryOverrides,
): LocalPreparedInstallContext;
function createPreparedInstallContextForScope(
  finalScope: "user" | "local",
  overrides?: Omit<Partial<InstallOutcome>, "writes">,
): PreparedInstallContext;
function createPreparedInstallContextForScope(
  finalScope: "user" | "local",
  overrides: Omit<Partial<InstallOutcome>, "writes"> = {},
): PreparedInstallContext {
  const commonFields = createCommonPreparedInstallContextFields(
    finalScope,
    overrides,
  );

  if (finalScope === "user") {
    const userOverrides = overrides as UserInstallSummaryOverrides;

    return {
      ...commonFields,
      ...createUserScopeDetails(userOverrides.switchedToUserScope ?? false),
    };
  }

  return {
    ...commonFields,
    ...createLocalScopeDetails(TEST_LOCAL_SCOPE_PATHS),
  };
}

function createTestInstallSummary(
  finalScope: "user",
  overrides?: UserInstallSummaryOverrides,
): Omit<UserInstallOutcome, "writes">;
function createTestInstallSummary(
  finalScope: "local",
  overrides?: LocalInstallSummaryOverrides,
): Omit<LocalInstallOutcome, "writes">;
function createTestInstallSummary(
  finalScope: "user" | "local",
  overrides?: Omit<Partial<InstallOutcome>, "writes">,
): Omit<InstallOutcome, "writes">;
function createTestInstallSummary(
  finalScope: "user" | "local",
  overrides: Omit<Partial<InstallOutcome>, "writes"> = {},
): Omit<InstallOutcome, "writes"> {
  return createInstallSummary(
    createPreparedInstallContextForScope(
      finalScope as "user" | "local",
      overrides,
    ),
  );
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
      ...createTestInstallSummary("user", summaryOverrides),
      ...summaryOverrides,
      writes,
    };
  }

  const localOverrides = overrides as Partial<LocalInstallOutcome>;
  const { writes = [], ...summaryOverrides } = localOverrides;

  return {
    ...createTestInstallSummary("local", summaryOverrides),
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
