import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MODEL } from "../src/constants/models.js";
import {
  planInstallManagedWritePhases,
  planInstallManagedWrites,
  type PlanInstallManagedWritesInput,
} from "../src/install/install-managed-writes.js";
import type {
  LoadedTomlConfig,
  TomlTable,
} from "../src/install/codex-config.js";
import type { InstallPaths } from "../src/install/settings-paths.js";
import type { TokenCommandConfig } from "../src/install/token-helper.js";

const testInstallPaths: InstallPaths = {
  codexHome: "/Users/test/.codex",
  modelCatalogPath: "/Users/test/.codex/model-catalogs/gonkagate.json",
  projectConfigPath: "/Users/test/project/.codex/config.toml",
  projectRoot: "/Users/test/project",
  tokenPath: "/Users/test/.codex/gonkagate/token",
  userConfigPath: "/Users/test/.codex/config.toml",
};

const testTokenCommand: TokenCommandConfig = {
  args: [],
  command: "/Users/test/.codex/bin/gonkagate-token",
  content: "#!/usr/bin/env node\n",
  fileMode: 0o700,
  helperFilePath: "/Users/test/.codex/bin/gonkagate-token",
};

function createPlanInput(
  finalScope: PlanInstallManagedWritesInput["finalScope"],
): PlanInstallManagedWritesInput {
  return {
    apiKey: "gp-test-key-123456",
    finalScope,
    installPaths: testInstallPaths,
    loadTomlConfig: async (filePath) => createLoadedTomlConfig(filePath, {}),
    selectedModel: DEFAULT_MODEL,
    tokenCommand: testTokenCommand,
  };
}

function createLoadedTomlConfig(
  filePath: string,
  settings: TomlTable,
): LoadedTomlConfig {
  return {
    exists: true,
    filePath,
    settings,
    text: "",
  };
}

test("planInstallManagedWrites keeps user-scope config after secret and helper writes", async () => {
  const writes = await planInstallManagedWrites(createPlanInput("user"));

  assert.deepEqual(
    writes.map((write) => write.kind),
    ["token", "token_helper", "model_catalog", "user_config"],
  );
  assert.deepEqual(
    writes.map((write) => write.filePath),
    [
      testInstallPaths.tokenPath,
      testTokenCommand.helperFilePath,
      testInstallPaths.modelCatalogPath,
      testInstallPaths.userConfigPath,
    ],
  );
});

test("planInstallManagedWrites appends local project config after the user layer", async () => {
  const writes = await planInstallManagedWrites(createPlanInput("local"));

  assert.deepEqual(
    writes.map((write) => write.kind),
    ["token", "token_helper", "model_catalog", "user_config", "project_config"],
  );
  assert.deepEqual(
    writes.map((write) => write.filePath),
    [
      testInstallPaths.tokenPath,
      testTokenCommand.helperFilePath,
      testInstallPaths.modelCatalogPath,
      testInstallPaths.userConfigPath,
      testInstallPaths.projectConfigPath,
    ],
  );
});

test("planInstallManagedWritePhases keeps commit phases explicit", async () => {
  const phases = await planInstallManagedWritePhases(createPlanInput("local"));

  assert.deepEqual(
    phases.map((phase) => phase.name),
    ["credentials", "catalog", "config"],
  );
  assert.deepEqual(
    phases.map((phase) => phase.writes.map((write) => write.kind)),
    [
      ["token", "token_helper"],
      ["model_catalog"],
      ["user_config", "project_config"],
    ],
  );
});
