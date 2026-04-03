import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MODEL } from "../src/constants/models.js";
import { getScopeConfigLayers } from "../src/install/install-scope.js";
import {
  planInstallManagedWritePhases,
  planInstallManagedWrites,
  type PlannedManagedWrite,
  type PlanInstallManagedWritesInput,
} from "../src/install/install-managed-writes.js";
import type {
  LoadedTomlConfig,
  TomlTable,
} from "../src/install/toml-config.js";
import type {
  InstallPaths,
  InstallScope,
} from "../src/install/settings-paths.js";
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
  finalScope: InstallScope,
): PlanInstallManagedWritesInput {
  return {
    apiKey: "gp-test-key-123456",
    configLayers: getScopeConfigLayers(finalScope),
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

function createWritePathMap(
  writes: readonly PlannedManagedWrite[],
): Record<string, string> {
  return Object.fromEntries(
    writes.map((write) => [write.kind, write.filePath]),
  );
}

test("planInstallManagedWrites keeps user-scope config after secret and helper writes", async () => {
  const writes = await planInstallManagedWrites(createPlanInput("user"));

  assert.deepEqual(writes.map((write) => write.kind).sort(), [
    "model_catalog",
    "token",
    "token_helper",
    "user_config",
  ]);
  assert.deepEqual(createWritePathMap(writes), {
    model_catalog: testInstallPaths.modelCatalogPath,
    token: testInstallPaths.tokenPath,
    token_helper: testTokenCommand.helperFilePath,
    user_config: testInstallPaths.userConfigPath,
  });
  assert.equal(
    writes.some((write) => write.kind === "project_config"),
    false,
  );
});

test("planInstallManagedWrites appends local project config after the user layer", async () => {
  const writes = await planInstallManagedWrites(createPlanInput("local"));

  assert.deepEqual(writes.map((write) => write.kind).sort(), [
    "model_catalog",
    "project_config",
    "token",
    "token_helper",
    "user_config",
  ]);
  assert.deepEqual(createWritePathMap(writes), {
    model_catalog: testInstallPaths.modelCatalogPath,
    project_config: testInstallPaths.projectConfigPath,
    token: testInstallPaths.tokenPath,
    token_helper: testTokenCommand.helperFilePath,
    user_config: testInstallPaths.userConfigPath,
  });
});

test("planInstallManagedWritePhases keeps commit phases explicit", async () => {
  const phases = await planInstallManagedWritePhases(createPlanInput("local"));
  const phasesByName = Object.fromEntries(
    phases.map((phase) => [
      phase.name,
      phase.writes.map((write) => write.kind).sort(),
    ]),
  );

  assert.deepEqual(phases.map((phase) => phase.name).sort(), [
    "catalog",
    "config",
    "credentials",
  ]);
  assert.deepEqual(phasesByName.credentials, ["token", "token_helper"]);
  assert.deepEqual(phasesByName.catalog, ["model_catalog"]);
  assert.deepEqual(phasesByName.config, ["project_config", "user_config"]);
});
