import assert from "node:assert/strict";
import test from "node:test";
import {
  GONKAGATE_PROVIDER_ID,
  GONKAGATE_PROVIDER_NAME,
} from "../src/constants/gateway.js";
import { DEFAULT_MODEL } from "../src/constants/models.js";
import {
  areEquivalentTomlTexts,
  buildInstallConfigPlan,
  createManagedTomlConfigWrite,
  getConfigTargetsForScope,
  resolveConfigTargetPath,
  type ConfigPathsInput,
} from "../src/install/codex-config.js";
import type { TokenCommandConfig } from "../src/install/token-helper.js";

const testPaths: ConfigPathsInput = {
  codexHome: "/Users/test/.codex",
  modelCatalogPath: "/Users/test/.codex/model-catalogs/gonkagate.json",
  projectRoot: "/Users/test/project",
};

const testTokenCommand: TokenCommandConfig = {
  args: [],
  command: "/Users/test/.codex/bin/gonkagate-token",
  content: "",
  fileMode: 0o700,
  helperFilePath: "/Users/test/.codex/bin/gonkagate-token",
};

test("getConfigTargetsForScope keeps scope ownership centralized", () => {
  assert.deepEqual(getConfigTargetsForScope("user"), ["user"]);
  assert.deepEqual(getConfigTargetsForScope("local"), ["user", "project"]);
});

test("resolveConfigTargetPath keeps config layer path ownership centralized", () => {
  assert.equal(
    resolveConfigTargetPath("user", {
      projectConfigPath: "/Users/test/project/.codex/config.toml",
      userConfigPath: "/Users/test/.codex/config.toml",
    }),
    "/Users/test/.codex/config.toml",
  );
  assert.equal(
    resolveConfigTargetPath("project", {
      projectConfigPath: "/Users/test/project/.codex/config.toml",
      userConfigPath: "/Users/test/.codex/config.toml",
    }),
    "/Users/test/project/.codex/config.toml",
  );
});

test("buildInstallConfigPlan keeps user scope activation in user config", () => {
  const [userLayer] = buildInstallConfigPlan({
    currentConfigs: {
      user: {
        analytics: {
          enabled: false,
        },
      },
    },
    finalScope: "user",
    paths: testPaths,
    selectedModel: DEFAULT_MODEL,
    tokenCommand: testTokenCommand,
  });

  assert.equal(userLayer.target, "user");
  assert.equal(userLayer.config.model_provider, GONKAGATE_PROVIDER_ID);
  assert.equal(userLayer.config.model, DEFAULT_MODEL.modelId);
  assert.equal(userLayer.config.model_catalog_json, testPaths.modelCatalogPath);
  assert.equal(
    (userLayer.config.analytics as Record<string, unknown>).enabled as boolean,
    false,
  );
});

test("buildInstallConfigPlan splits local scope across user and project layers", () => {
  const configPlan = buildInstallConfigPlan({
    currentConfigs: {
      project: {
        theme: "keep",
      },
      user: {
        analytics: {
          enabled: false,
        },
      },
    },
    finalScope: "local",
    paths: testPaths,
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

  assert.equal(projectLayer.config.model_provider, GONKAGATE_PROVIDER_ID);
  assert.equal(projectLayer.config.model, DEFAULT_MODEL.modelId);
  assert.equal(
    projectLayer.config.model_catalog_json,
    testPaths.modelCatalogPath,
  );
  assert.equal(projectLayer.config.theme, "keep");
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
