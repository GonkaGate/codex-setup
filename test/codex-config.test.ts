import assert from "node:assert/strict";
import test from "node:test";
import { GONKAGATE_PROVIDER_ID } from "../src/constants/gateway.js";
import { DEFAULT_MODEL } from "../src/constants/models.js";
import {
  buildInstallConfigPlan,
  planInstallConfigWrites,
  type InstallConfigPaths,
} from "../src/install/codex-config.js";
import {
  areEquivalentTomlTexts,
  createManagedTomlConfigWrite,
} from "../src/install/toml-config.js";
import {
  expectTomlBoolean,
  expectTomlTable,
} from "./helpers/structured-data.js";
import {
  expectGonkagateActivationConfig,
  expectGonkagateProviderConfig,
  expectTrustedProjectConfig,
} from "./helpers/install-config-assertions.js";
import {
  TEST_CODEX_HOME,
  TEST_INSTALL_PATHS,
  TEST_NODE_EXECUTABLE,
  TEST_PLATFORM,
  TEST_TOKEN_COMMAND,
  createLoadedTomlConfig,
} from "./helpers/install-fixtures.js";

const testPaths: InstallConfigPaths = TEST_INSTALL_PATHS;

test("planInstallConfigWrites keeps user scope config ownership centralized", async () => {
  const [userLayer] = await planInstallConfigWrites({
    finalScope: "user",
    loadTomlConfig: async (filePath) =>
      createLoadedTomlConfig(
        filePath,
        filePath === testPaths.userConfigPath
          ? {
              analytics: {
                enabled: false,
              },
            }
          : {},
      ),
    paths: {
      ...testPaths,
    },
    selectedModel: DEFAULT_MODEL,
    tokenCommand: TEST_TOKEN_COMMAND,
  });

  assert.equal(userLayer.target, "user");
  assert.equal(userLayer.filePath, testPaths.userConfigPath);
  expectGonkagateActivationConfig(userLayer.config, {
    configLabel: "userLayer.config",
    modelCatalogPath: testPaths.modelCatalogPath,
  });
  expectGonkagateProviderConfig(userLayer.config, {
    codexHome: TEST_CODEX_HOME,
    configLabel: "userLayer.config",
    helperPath: TEST_TOKEN_COMMAND.helperFilePath,
    nodeExecutable: TEST_NODE_EXECUTABLE,
    platform: TEST_PLATFORM,
  });
  const analyticsConfig = expectTomlTable(
    userLayer.config.analytics,
    "userLayer.config.analytics",
  );
  assert.equal(
    expectTomlBoolean(
      analyticsConfig.enabled,
      "userLayer.config.analytics.enabled",
    ),
    false,
  );
});

test("planInstallConfigWrites splits local scope across user and project layers", async () => {
  const configPlan = await planInstallConfigWrites({
    finalScope: "local",
    loadTomlConfig: async (filePath) =>
      createLoadedTomlConfig(
        filePath,
        filePath === testPaths.projectConfigPath
          ? {
              theme: "keep",
            }
          : {
              analytics: {
                enabled: false,
              },
            },
      ),
    paths: {
      ...testPaths,
    },
    selectedModel: DEFAULT_MODEL,
    tokenCommand: TEST_TOKEN_COMMAND,
  });

  assert.deepEqual(
    configPlan.map((entry) => entry.target),
    ["user", "project"],
  );

  const userLayer = configPlan[0];
  const projectLayer = configPlan[1];

  assert.equal(userLayer.filePath, testPaths.userConfigPath);
  assert.equal(userLayer.config.model_provider, undefined);
  assert.equal(userLayer.config.model, undefined);
  expectGonkagateProviderConfig(userLayer.config, {
    codexHome: TEST_CODEX_HOME,
    configLabel: "userLayer.config",
    helperPath: TEST_TOKEN_COMMAND.helperFilePath,
    nodeExecutable: TEST_NODE_EXECUTABLE,
    platform: TEST_PLATFORM,
  });
  expectTrustedProjectConfig(
    userLayer.config,
    testPaths.projectRoot,
    "userLayer.config",
  );

  assert.equal(projectLayer.filePath, testPaths.projectConfigPath);
  expectGonkagateActivationConfig(projectLayer.config, {
    configLabel: "projectLayer.config",
    modelCatalogPath: testPaths.modelCatalogPath,
  });
  assert.equal(projectLayer.config.theme, "keep");
});

test("planInstallConfigWrites only loads config files for the active scope layers", async () => {
  const userScopeLoads: string[] = [];
  await planInstallConfigWrites({
    finalScope: "user",
    loadTomlConfig: async (filePath) => {
      userScopeLoads.push(filePath);
      return createLoadedTomlConfig(filePath, {});
    },
    paths: {
      ...testPaths,
    },
    selectedModel: DEFAULT_MODEL,
    tokenCommand: TEST_TOKEN_COMMAND,
  });

  assert.deepEqual(userScopeLoads, [testPaths.userConfigPath]);

  const localScopeLoads: string[] = [];
  await planInstallConfigWrites({
    finalScope: "local",
    loadTomlConfig: async (filePath) => {
      localScopeLoads.push(filePath);
      return createLoadedTomlConfig(filePath, {});
    },
    paths: {
      ...testPaths,
    },
    selectedModel: DEFAULT_MODEL,
    tokenCommand: TEST_TOKEN_COMMAND,
  });

  assert.deepEqual(localScopeLoads, [
    testPaths.userConfigPath,
    testPaths.projectConfigPath,
  ]);
});

test("buildInstallConfigPlan keeps pure config merging separate from file loading", () => {
  const [userLayer] = buildInstallConfigPlan({
    existingConfigs: {
      user: {
        analytics: {
          enabled: false,
        },
      },
    },
    finalScope: "user",
    paths: {
      ...testPaths,
    },
    selectedModel: DEFAULT_MODEL,
    tokenCommand: TEST_TOKEN_COMMAND,
  });

  assert.equal(userLayer.target, "user");
  expectGonkagateActivationConfig(userLayer.config, {
    configLabel: "userLayer.config",
    modelCatalogPath: testPaths.modelCatalogPath,
  });
});

test("createManagedTomlConfigWrite keeps TOML render and no-op comparison together", () => {
  const managedWrite = createManagedTomlConfigWrite({
    model: DEFAULT_MODEL.modelId,
  });

  assert.equal(managedWrite.content, `model = "${DEFAULT_MODEL.modelId}"\n`);
  assert.equal(
    managedWrite.contentComparator(
      'model = "gpt-5.4"\r\n',
      'model = "gpt-5.4"\n',
    ),
    true,
  );
  assert.equal(
    areEquivalentTomlTexts('model = "gpt-5.4"\n', 'model = "gpt-5.3"\n'),
    false,
  );
});
