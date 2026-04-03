import {
  DEFAULT_MODEL,
  type SupportedModel,
} from "../../src/constants/models.js";
import {
  buildInstallArtifacts,
  type InstallArtifacts,
} from "../../src/install/install-artifacts.js";
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

export const TEST_INSTALL_ARTIFACTS: InstallArtifacts = buildInstallArtifacts({
  environment: {
    CODEX_HOME: TEST_CODEX_HOME,
  },
  nodeExecutable: TEST_NODE_EXECUTABLE,
  platform: TEST_PLATFORM,
  projectRoot: TEST_PROJECT_ROOT,
});

export const TEST_INSTALL_PATHS = TEST_INSTALL_ARTIFACTS.installPaths;

export const TEST_LOCAL_SCOPE_PATHS = {
  projectConfigPath: TEST_INSTALL_PATHS.projectConfigPath,
  projectRoot: TEST_INSTALL_PATHS.projectRoot,
} as const;

export const TEST_TOKEN_COMMAND = TEST_INSTALL_ARTIFACTS.tokenCommand;

export interface CommonInstallOutcomeFields {
  codex: {
    command: string;
    version: string;
  };
  helperPath: string;
  modelCatalogPath: string;
  projectRoot: string;
  selectedModel: SupportedModel;
  tokenPath: string;
  userConfigPath: string;
}

export function createCommonInstallOutcomeFields(): CommonInstallOutcomeFields {
  return {
    codex: {
      command: "codex",
      version: DEFAULT_TEST_CODEX_VERSION,
    },
    helperPath: TEST_TOKEN_COMMAND.helperFilePath,
    modelCatalogPath: TEST_INSTALL_PATHS.modelCatalogPath,
    projectRoot: TEST_INSTALL_PATHS.projectRoot,
    selectedModel: DEFAULT_MODEL,
    tokenPath: TEST_INSTALL_PATHS.tokenPath,
    userConfigPath: TEST_INSTALL_PATHS.userConfigPath,
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
