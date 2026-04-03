import assert from "node:assert/strict";
import test from "node:test";
import {
  GONKAGATE_PROVIDER_ID,
  GONKAGATE_PROVIDER_NAME,
} from "../src/constants/gateway.js";
import { DEFAULT_MODEL } from "../src/constants/models.js";
import {
  buildInstallConfigPlan,
  planInstallConfigWrites,
  type InstallConfigPaths,
} from "../src/install/codex-config.js";
import {
  areEquivalentTomlTexts,
  createManagedTomlConfigWrite,
  type LoadedTomlConfig,
  type TomlTable,
} from "../src/install/toml-config.js";
import type { TokenCommandConfig } from "../src/install/token-helper.js";

const testPaths: InstallConfigPaths = {
  codexHome: "/Users/test/.codex",
  modelCatalogPath: "/Users/test/.codex/model-catalogs/gonkagate.json",
  projectConfigPath: "/Users/test/project/.codex/config.toml",
  projectRoot: "/Users/test/project",
  userConfigPath: "/Users/test/.codex/config.toml",
};

const testLayerPaths = {
  projectConfigPath: "/Users/test/project/.codex/config.toml",
  userConfigPath: "/Users/test/.codex/config.toml",
};

const testTokenCommand: TokenCommandConfig = {
  args: [],
  command: "/Users/test/.codex/bin/gonkagate-token",
  content: "",
  fileMode: 0o700,
  helperFilePath: "/Users/test/.codex/bin/gonkagate-token",
};

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

test("planInstallConfigWrites keeps user scope config ownership centralized", async () => {
  const [userLayer] = await planInstallConfigWrites({
    finalScope: "user",
    loadTomlConfig: async (filePath) =>
      createLoadedTomlConfig(
        filePath,
        filePath === testLayerPaths.userConfigPath
          ? {
              analytics: {
                enabled: false,
              },
            }
          : {},
      ),
    paths: {
      ...testPaths,
      ...testLayerPaths,
    },
    selectedModel: DEFAULT_MODEL,
    tokenCommand: testTokenCommand,
  });

  assert.equal(userLayer.target, "user");
  assert.equal(userLayer.filePath, testLayerPaths.userConfigPath);
  assert.equal(userLayer.config.model_provider, GONKAGATE_PROVIDER_ID);
  assert.equal(userLayer.config.model, DEFAULT_MODEL.modelId);
  assert.equal(userLayer.config.model_catalog_json, testPaths.modelCatalogPath);
  assert.equal(
    (userLayer.config.analytics as Record<string, unknown>).enabled as boolean,
    false,
  );
});

test("planInstallConfigWrites splits local scope across user and project layers", async () => {
  const configPlan = await planInstallConfigWrites({
    finalScope: "local",
    loadTomlConfig: async (filePath) =>
      createLoadedTomlConfig(
        filePath,
        filePath === testLayerPaths.projectConfigPath
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
      ...testLayerPaths,
    },
    selectedModel: DEFAULT_MODEL,
    tokenCommand: testTokenCommand,
  });

  assert.deepEqual(
    configPlan.map((entry) => entry.target),
    ["user", "project"],
  );

  const userLayer = configPlan[0];
  const projectLayer = configPlan[1];
  const userProjects = userLayer.config.projects as Record<string, unknown>;

  assert.equal(userLayer.filePath, testLayerPaths.userConfigPath);
  assert.equal(userLayer.config.model_provider, undefined);
  assert.equal(userLayer.config.model, undefined);
  assert.equal(
    (
      (userLayer.config.model_providers as Record<string, unknown>)[
        GONKAGATE_PROVIDER_ID
      ] as Record<string, unknown>
    ).name,
    GONKAGATE_PROVIDER_NAME,
  );
  assert.equal(
    (userProjects[testPaths.projectRoot] as Record<string, unknown>)
      .trust_level,
    "trusted",
  );

  assert.equal(projectLayer.filePath, testLayerPaths.projectConfigPath);
  assert.equal(projectLayer.config.model_provider, GONKAGATE_PROVIDER_ID);
  assert.equal(projectLayer.config.model, DEFAULT_MODEL.modelId);
  assert.equal(
    projectLayer.config.model_catalog_json,
    testPaths.modelCatalogPath,
  );
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
      ...testLayerPaths,
    },
    selectedModel: DEFAULT_MODEL,
    tokenCommand: testTokenCommand,
  });

  assert.deepEqual(userScopeLoads, [testLayerPaths.userConfigPath]);

  const localScopeLoads: string[] = [];
  await planInstallConfigWrites({
    finalScope: "local",
    loadTomlConfig: async (filePath) => {
      localScopeLoads.push(filePath);
      return createLoadedTomlConfig(filePath, {});
    },
    paths: {
      ...testPaths,
      ...testLayerPaths,
    },
    selectedModel: DEFAULT_MODEL,
    tokenCommand: testTokenCommand,
  });

  assert.deepEqual(localScopeLoads, [
    testLayerPaths.userConfigPath,
    testLayerPaths.projectConfigPath,
  ]);
});

test("buildInstallConfigPlan keeps pure config merging separate from file loading", () => {
  const [userLayer] = buildInstallConfigPlan({
    existingConfigs: {
      userConfig: {
        analytics: {
          enabled: false,
        },
      },
    },
    finalScope: "user",
    paths: {
      ...testPaths,
      ...testLayerPaths,
    },
    selectedModel: DEFAULT_MODEL,
    tokenCommand: testTokenCommand,
  });

  assert.equal(userLayer.target, "user");
  assert.equal(userLayer.config.model_provider, GONKAGATE_PROVIDER_ID);
  assert.equal(userLayer.config.model, DEFAULT_MODEL.modelId);
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
