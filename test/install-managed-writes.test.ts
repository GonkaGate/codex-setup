import assert from "node:assert/strict";
import test from "node:test";
import {
  planInstallManagedWritePhases,
  planInstallManagedWrites,
  type ManagedWritePlan,
  type PlanInstallManagedWritesInput,
} from "../src/install/install-managed-writes.js";
import type { InstallScope } from "../src/install/settings-paths.js";
import {
  DEFAULT_TEST_API_KEY,
  DEFAULT_TEST_MODEL,
  TEST_INSTALL_PATHS,
  TEST_MODELS,
  TEST_TOKEN_COMMAND,
  createLoadedTomlConfig,
} from "./helpers/install-fixtures.js";

function createPlanInput(
  finalScope: InstallScope,
): PlanInstallManagedWritesInput {
  return {
    apiKey: DEFAULT_TEST_API_KEY,
    availableModels: TEST_MODELS,
    finalScope,
    installPaths: TEST_INSTALL_PATHS,
    loadTomlConfig: async (filePath) => createLoadedTomlConfig(filePath, {}),
    selectedModel: DEFAULT_TEST_MODEL,
    tokenCommand: TEST_TOKEN_COMMAND,
  };
}

function createWritePathMap(
  writes: readonly ManagedWritePlan[],
): Record<string, string> {
  return Object.fromEntries(
    writes.map((write) => [write.kind, write.filePath]),
  );
}

test("planInstallManagedWrites keeps user-scope config after secret and helper writes", async () => {
  const writes = await planInstallManagedWrites(createPlanInput("user"));

  assert.deepEqual(
    writes.map((write) => write.kind),
    ["token", "token_helper", "model_catalog", "user_config"],
  );
  assert.deepEqual(createWritePathMap(writes), {
    model_catalog: TEST_INSTALL_PATHS.modelCatalogPath,
    token: TEST_INSTALL_PATHS.tokenPath,
    token_helper: TEST_TOKEN_COMMAND.helperFilePath,
    user_config: TEST_INSTALL_PATHS.userConfigPath,
  });
  assert.equal(
    writes.some((write) => write.kind === "project_config"),
    false,
  );
});

test("planInstallManagedWrites appends local project config after the user layer", async () => {
  const writes = await planInstallManagedWrites(createPlanInput("local"));

  assert.deepEqual(
    writes.map((write) => write.kind),
    ["token", "token_helper", "model_catalog", "user_config", "project_config"],
  );
  assert.deepEqual(createWritePathMap(writes), {
    model_catalog: TEST_INSTALL_PATHS.modelCatalogPath,
    project_config: TEST_INSTALL_PATHS.projectConfigPath,
    token: TEST_INSTALL_PATHS.tokenPath,
    token_helper: TEST_TOKEN_COMMAND.helperFilePath,
    user_config: TEST_INSTALL_PATHS.userConfigPath,
  });
});

test("planInstallManagedWritePhases keeps commit phases explicit", async () => {
  const phases = await planInstallManagedWritePhases(createPlanInput("local"));
  const phasesByName = Object.fromEntries(
    phases.map((phase) => [
      phase.name,
      phase.writes.map((write) => write.kind),
    ]),
  );

  assert.deepEqual(
    phases.map((phase) => phase.name),
    ["credentials", "catalog", "config"],
  );
  assert.deepEqual(phasesByName.credentials, ["token", "token_helper"]);
  assert.deepEqual(phasesByName.catalog, ["model_catalog"]);
  assert.deepEqual(phasesByName.config, ["user_config", "project_config"]);
});
