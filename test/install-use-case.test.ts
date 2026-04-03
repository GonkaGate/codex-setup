import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DEFAULT_MODEL } from "../src/constants/models.js";
import { buildBackupGlob } from "../src/install/backup.js";
import { InstallCommitError } from "../src/install/install-errors.js";
import { LOCAL_PROJECT_CONFIG_RELATIVE_PATH } from "../src/install/settings-paths.js";
import { createInstallScenario } from "./helpers/install-scenario.js";
import {
  expectGonkagateActivationConfig,
  expectGonkagateProviderConfig,
  expectTrustedProjectConfig,
} from "./helpers/install-config-assertions.js";
import {
  DEFAULT_TEST_API_KEY,
  createLoadedTomlConfig,
} from "./helpers/install-fixtures.js";
import {
  expectJsonArray,
  expectJsonObject,
  expectJsonString,
  expectTomlBoolean,
  expectTomlTable,
  parseJsonObject,
  parseTomlTable,
} from "./helpers/structured-data.js";

test("user scope writes GonkaGate provider, token helper, and curated catalog", async () => {
  const scenario = await createInstallScenario("user", {
    scope: "user",
  });

  const outcome = await scenario.run();

  assert.equal(outcome.finalScope, "user");
  assert.equal("configLayers" in outcome, false);
  assert.equal(outcome.projectConfigPath, undefined);

  const userConfig = parseTomlTable(
    await readFile(outcome.userConfigPath, "utf8"),
  );
  expectGonkagateActivationConfig(userConfig, {
    configLabel: "userConfig",
    modelCatalogPath: outcome.modelCatalogPath,
  });
  expectGonkagateProviderConfig(userConfig, {
    codexHome: scenario.codexHome,
    configLabel: "userConfig",
    helperPath: outcome.helperPath,
    nodeExecutable: process.execPath,
    platform: process.platform,
  });

  assert.equal(
    (await readFile(outcome.tokenPath, "utf8")).trim(),
    DEFAULT_TEST_API_KEY,
  );
  const modelCatalog = parseJsonObject(
    await readFile(outcome.modelCatalogPath, "utf8"),
    "model catalog",
  );
  const modelCatalogModels = expectJsonArray(
    modelCatalog.models,
    "modelCatalog.models",
  );
  assert.deepEqual(
    modelCatalogModels.map((model, index) =>
      expectJsonString(
        expectJsonObject(model, `modelCatalog.models[${index}]`).slug,
        `modelCatalog.models[${index}].slug`,
      ),
    ),
    [DEFAULT_MODEL.modelId],
  );

  assert.deepEqual(
    outcome.writes.map((write) => write.filePath).sort(),
    [
      outcome.helperPath,
      outcome.modelCatalogPath,
      outcome.tokenPath,
      outcome.userConfigPath,
    ].sort(),
  );
  assert.equal(
    outcome.writes.every((write) => write.changed),
    true,
  );
});

test("local scope keeps activation in the project file and trusts the repo root", async () => {
  const scenario = await createInstallScenario("local", {
    scope: "local",
  });
  scenario.initGitRepo();

  const outcome = await scenario.run();

  assert.equal(outcome.finalScope, "local");
  assert.equal(
    outcome.projectConfigPath,
    scenario.installPaths.projectConfigPath,
  );
  assert.equal(outcome.trustTargetPath, scenario.workspace);

  const userConfig = parseTomlTable(
    await readFile(outcome.userConfigPath, "utf8"),
  );
  assert.equal(userConfig.model_provider, undefined);
  assert.equal(userConfig.model, undefined);
  expectTrustedProjectConfig(userConfig, scenario.workspace, "userConfig");
  expectGonkagateProviderConfig(userConfig, {
    codexHome: scenario.codexHome,
    configLabel: "userConfig",
    helperPath: outcome.helperPath,
    nodeExecutable: process.execPath,
    platform: process.platform,
  });

  const projectConfig = parseTomlTable(
    await readFile(outcome.projectConfigPath, "utf8"),
  );
  expectGonkagateActivationConfig(projectConfig, {
    configLabel: "projectConfig",
    modelCatalogPath: outcome.modelCatalogPath,
  });

  const excludePath = path.join(scenario.workspace, ".git", "info", "exclude");
  const excludeText = await readFile(excludePath, "utf8");
  assert.match(excludeText, /\/\.codex\/config\.toml/);
  assert.equal(
    excludeText.includes(
      buildBackupGlob(`/${LOCAL_PROJECT_CONFIG_RELATIVE_PATH}`),
    ),
    true,
  );
});

test("tracked local config switches to user scope when requested", async () => {
  const scenario = await createInstallScenario("tracked", {
    scope: "local",
    trackedLocalAction: "user",
  });
  scenario.initGitRepo();
  await scenario.trackLocalProjectConfig();

  const outcome = await scenario.run();

  assert.equal(outcome.finalScope, "user");
  assert.equal(outcome.switchedToUserScope, true);
  assert.equal(outcome.projectConfigPath, undefined);
  assert.equal(
    await readFile(scenario.installPaths.projectConfigPath, "utf8"),
    'model_provider = "openai"\n',
  );
});

test("tracked local config can cancel without touching config files or git exclude", async () => {
  const scenario = await createInstallScenario("tracked-cancel", {
    scope: "local",
    trackedLocalAction: "cancel",
  });
  scenario.initGitRepo();
  await scenario.trackLocalProjectConfig();

  const excludePath = path.join(scenario.workspace, ".git", "info", "exclude");
  const initialExcludeText = await readFile(excludePath, "utf8");
  const trackedConfigPath = scenario.installPaths.projectConfigPath;

  await assert.rejects(() => scenario.run(), /Installation cancelled\./);

  assert.equal(
    await readFile(trackedConfigPath, "utf8"),
    'model_provider = "openai"\n',
  );
  await assert.rejects(
    () => readFile(scenario.installPaths.userConfigPath, "utf8"),
    /ENOENT/,
  );
  assert.equal(await readFile(excludePath, "utf8"), initialExcludeText);
});

test("existing user config and token files are preserved via backups before overwrite", async () => {
  const scenario = await createInstallScenario("backup", {
    apiKey: "gp-new-key-999999",
    scope: "user",
  });
  await mkdir(scenario.codexHome, {
    recursive: true,
  });
  await writeFile(
    scenario.installPaths.userConfigPath,
    ['model = "gpt-5.3-codex"', "", "[analytics]", "enabled = false", ""].join(
      "\n",
    ),
    "utf8",
  );
  await mkdir(path.dirname(scenario.installPaths.tokenPath), {
    recursive: true,
  });
  await writeFile(scenario.installPaths.tokenPath, "gp-old-key\n", "utf8");

  const outcome = await scenario.run();

  const backupPaths = outcome.writes
    .map((write) => write.backupPath)
    .filter((backupPath): backupPath is string => backupPath !== undefined);

  assert.equal(backupPaths.length >= 2, true);
  for (const backupPath of backupPaths) {
    const backupStats = await stat(backupPath);
    assert.equal(backupStats.isFile(), true);
  }

  const userConfig = parseTomlTable(
    await readFile(outcome.userConfigPath, "utf8"),
  );
  expectGonkagateActivationConfig(userConfig, {
    configLabel: "userConfig",
    modelCatalogPath: outcome.modelCatalogPath,
  });
  const analyticsConfig = expectTomlTable(
    userConfig.analytics,
    "userConfig.analytics",
  );
  assert.equal(
    expectTomlBoolean(analyticsConfig.enabled, "userConfig.analytics.enabled"),
    false,
  );
  assert.equal(
    (await readFile(outcome.tokenPath, "utf8")).trim(),
    "gp-new-key-999999",
  );
});

test("prepare failures stop before repo exclusion and managed file writes begin", async () => {
  const scenario = await createInstallScenario("prepare", {
    scope: "local",
  });
  scenario.initGitRepo();

  const excludePath = path.join(scenario.workspace, ".git", "info", "exclude");
  const initialExcludeText = await readFile(excludePath, "utf8");
  const baseDependencies = scenario.createDependencies();
  let excludeCount = 0;
  let loadCount = 0;
  let writeCount = 0;

  const dependencies = scenario.createDependencies({
    commit: {
      ensureLocalProjectConfigExcluded: async (configInspection) => {
        excludeCount += 1;
        return baseDependencies.commit.ensureLocalProjectConfigExcluded(
          configInspection,
        );
      },
      writeManagedTextFile: async () => {
        writeCount += 1;
        throw new Error("write should not be attempted");
      },
    },
    planning: {
      loadTomlConfig: async (filePath) => {
        loadCount += 1;

        if (loadCount === 1) {
          return createLoadedTomlConfig(filePath, {}, { exists: false });
        }

        throw new Error("project config is invalid");
      },
    },
  });

  await assert.rejects(
    () => scenario.run({ dependencies }),
    /project config is invalid/,
  );

  assert.equal(excludeCount, 0);
  assert.equal(loadCount, 2);
  assert.equal(writeCount, 0);
  assert.equal(await readFile(excludePath, "utf8"), initialExcludeText);
});

test("commit failures roll back completed managed writes and preserve prior files", async () => {
  const scenario = await createInstallScenario("rollback", {
    apiKey: "gp-new-key-999999",
    scope: "user",
  });
  const baseDependencies = scenario.createDependencies();
  const tokenPath = scenario.installPaths.tokenPath;
  const helperPath = scenario.tokenCommand.helperFilePath;
  await writeFile(
    scenario.installPaths.userConfigPath,
    'model = "openai"\n',
    "utf8",
  );
  await mkdir(path.dirname(tokenPath), {
    recursive: true,
  });
  await writeFile(tokenPath, "gp-old-key\n", "utf8");

  const failingUserConfigPath = scenario.installPaths.userConfigPath;
  const dependencies = scenario.createDependencies({
    commit: {
      writeManagedTextFile: async (filePath, content, options) => {
        if (filePath === failingUserConfigPath) {
          throw new Error("simulated config write failure");
        }

        return baseDependencies.commit.writeManagedTextFile(
          filePath,
          content,
          options,
        );
      },
    },
  });

  await assert.rejects(
    () => scenario.run({ dependencies }),
    (error: unknown) => {
      assert.equal(error instanceof InstallCommitError, true);
      assert.match(
        error instanceof Error ? error.message : String(error),
        /rolled back/i,
      );

      if (!(error instanceof InstallCommitError)) {
        return false;
      }

      assert.equal(error.completedWrites.length, 3);
      assert.deepEqual(
        error.completedWrites.map((write) => write.filePath),
        [tokenPath, helperPath, scenario.installPaths.modelCatalogPath],
      );
      assert.deepEqual(error.rollbackFailures, []);
      return true;
    },
  );

  assert.equal(await readFile(tokenPath, "utf8"), "gp-old-key\n");
  await assert.rejects(() => stat(helperPath), /ENOENT/);
  await assert.rejects(
    () => stat(scenario.installPaths.modelCatalogPath),
    /ENOENT/,
  );
  assert.equal(
    await readFile(scenario.installPaths.userConfigPath, "utf8"),
    'model = "openai"\n',
  );
});

test("local scope resolves the git repo root even from nested directories", async () => {
  const scenario = await createInstallScenario("nested", {
    scope: "local",
  });
  const nestedDirectory = path.join(scenario.workspace, "packages", "cli");
  await mkdir(nestedDirectory, {
    recursive: true,
  });
  scenario.initGitRepo();

  const outcome = await scenario.run({
    cwd: nestedDirectory,
  });

  assert.equal(outcome.projectRoot, scenario.workspace);
  assert.equal(outcome.trustTargetPath, scenario.workspace);
  assert.equal(
    outcome.projectConfigPath,
    scenario.installPaths.projectConfigPath,
  );
});
