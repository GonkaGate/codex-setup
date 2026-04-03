import {
  DEFAULT_MODEL,
  type SupportedModel,
} from "../../src/constants/models.js";
import type { InstallPaths } from "../../src/install/settings-paths.js";
import type { TokenCommandConfig } from "../../src/install/token-helper.js";
import type {
  LoadedTomlConfig,
  TomlTable,
} from "../../src/install/toml-config.js";

export const DEFAULT_TEST_API_KEY = "gp-test-key-123456";
export const DEFAULT_TEST_CODEX_VERSION = "0.118.0";
export const TEST_PROJECT_ROOT = "/Users/test/project";
export const TEST_CODEX_HOME = "/Users/test/.codex";

export const TEST_INSTALL_PATHS: InstallPaths = {
  codexHome: TEST_CODEX_HOME,
  modelCatalogPath: "/Users/test/.codex/model-catalogs/gonkagate.json",
  projectConfigPath: "/Users/test/project/.codex/config.toml",
  projectRoot: TEST_PROJECT_ROOT,
  tokenPath: "/Users/test/.codex/gonkagate/token",
  userConfigPath: "/Users/test/.codex/config.toml",
};

export const TEST_LOCAL_SCOPE_PATHS = {
  projectConfigPath: TEST_INSTALL_PATHS.projectConfigPath,
  projectRoot: TEST_INSTALL_PATHS.projectRoot,
} as const;

export const TEST_TOKEN_COMMAND: TokenCommandConfig = {
  args: [],
  command: "/Users/test/.codex/bin/gonkagate-token",
  content: "#!/usr/bin/env node\n",
  fileMode: 0o700,
  helperFilePath: "/Users/test/.codex/bin/gonkagate-token",
};

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
