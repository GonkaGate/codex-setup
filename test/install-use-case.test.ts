import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import TOML from "@iarna/toml";
import {
  GONKAGATE_BASE_URL,
  GONKAGATE_PROVIDER_ID,
} from "../src/constants/gateway.js";
import { DEFAULT_MODEL } from "../src/constants/models.js";
import { buildBackupGlob } from "../src/install/backup.js";
import { InstallCommitError } from "../src/install/install-errors.js";
import { createTokenCommandConfig } from "../src/install/token-helper.js";
import {
  DEFAULT_TEST_API_KEY,
  createInstallScenario,
} from "./helpers/install-scenario.js";
import { initGitRepo, trackLocalProjectConfig } from "./helpers/workspace.js";

function parseToml(text: string): Record<string, unknown> {
  return TOML.parse(text) as Record<string, unknown>;
}

test("user scope writes GonkaGate provider, token helper, and curated catalog", async () => {
  const scenario = await createInstallScenario("user", {
    scope: "user",
  });

  const outcome = await scenario.run();

  assert.equal(outcome.finalScope, "user");
  assert.equal("configLayers" in outcome, false);
  assert.equal(outcome.projectConfigPath, undefined);

  const userConfig = parseToml(await readFile(outcome.userConfigPath, "utf8"));
  assert.equal(userConfig.model_provider, GONKAGATE_PROVIDER_ID);
  assert.equal(userConfig.model, DEFAULT_MODEL.modelId);
  assert.equal(userConfig.model_catalog_json, outcome.modelCatalogPath);

  const providers = userConfig.model_providers as Record<string, unknown>;
  const provider = providers[GONKAGATE_PROVIDER_ID] as Record<string, unknown>;
  const auth = provider.auth as Record<string, unknown>;
  assert.equal(provider.base_url, GONKAGATE_BASE_URL);
  assert.equal(provider.wire_api, "responses");
  assert.equal(provider.supports_websockets, false);
  assert.equal(auth.cwd, scenario.codexHome);

  if (process.platform === "win32") {
    assert.equal(auth.command, process.execPath);
    assert.deepEqual(auth.args, [outcome.helperPath]);
  } else {
    assert.equal(auth.command, outcome.helperPath);
    assert.equal(auth.args, undefined);
  }

  assert.equal(
    (await readFile(outcome.tokenPath, "utf8")).trim(),
    DEFAULT_TEST_API_KEY,
  );
  const modelCatalog = JSON.parse(
    await readFile(outcome.modelCatalogPath, "utf8"),
  ) as { models: Array<{ slug: string }> };
  assert.deepEqual(
    modelCatalog.models.map((model) => model.slug),
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
  initGitRepo(scenario.workspace);

  const outcome = await scenario.run();

  assert.equal(outcome.finalScope, "local");
  assert.equal(
    outcome.projectConfigPath,
    path.join(scenario.workspace, ".codex", "config.toml"),
  );
  assert.equal(outcome.trustTargetPath, scenario.workspace);

  const userConfig = parseToml(await readFile(outcome.userConfigPath, "utf8"));
  assert.equal(userConfig.model_provider, undefined);
  assert.equal(userConfig.model, undefined);

  const projects = userConfig.projects as Record<string, unknown>;
  const trustedProject = projects[scenario.workspace] as Record<
    string,
    unknown
  >;
  assert.equal(trustedProject.trust_level, "trusted");

  const projectConfig = parseToml(
    await readFile(outcome.projectConfigPath, "utf8"),
  );
  assert.equal(projectConfig.model_provider, GONKAGATE_PROVIDER_ID);
  assert.equal(projectConfig.model, DEFAULT_MODEL.modelId);
  assert.equal(projectConfig.model_catalog_json, outcome.modelCatalogPath);

  const excludePath = path.join(scenario.workspace, ".git", "info", "exclude");
  const excludeText = await readFile(excludePath, "utf8");
  assert.match(excludeText, /\/\.codex\/config\.toml/);
  assert.equal(
    excludeText.includes(buildBackupGlob("/.codex/config.toml")),
    true,
  );
});

test("tracked local config switches to user scope when requested", async () => {
  const scenario = await createInstallScenario("tracked", {
    scope: "local",
    trackedLocalAction: "user",
  });
  initGitRepo(scenario.workspace);
  await trackLocalProjectConfig(scenario.workspace);

  const outcome = await scenario.run();

  assert.equal(outcome.finalScope, "user");
  assert.equal(outcome.switchedToUserScope, true);
  assert.equal(outcome.projectConfigPath, undefined);
  assert.equal(
    await readFile(
      path.join(scenario.workspace, ".codex", "config.toml"),
      "utf8",
    ),
    'model_provider = "openai"\n',
  );
});

test("tracked local config can cancel without touching config files or git exclude", async () => {
  const scenario = await createInstallScenario("tracked-cancel", {
    scope: "local",
    trackedLocalAction: "cancel",
  });
  initGitRepo(scenario.workspace);
  await trackLocalProjectConfig(scenario.workspace);

  const excludePath = path.join(scenario.workspace, ".git", "info", "exclude");
  const initialExcludeText = await readFile(excludePath, "utf8");
  const trackedConfigPath = path.join(
    scenario.workspace,
    ".codex",
    "config.toml",
  );

  await assert.rejects(() => scenario.run(), /Installation cancelled\./);

  assert.equal(
    await readFile(trackedConfigPath, "utf8"),
    'model_provider = "openai"\n',
  );
  await assert.rejects(
    () => readFile(path.join(scenario.codexHome, "config.toml"), "utf8"),
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
    path.join(scenario.codexHome, "config.toml"),
    ['model = "gpt-5.3-codex"', "", "[analytics]", "enabled = false", ""].join(
      "\n",
    ),
    "utf8",
  );
  await mkdir(path.join(scenario.codexHome, "gonkagate"), {
    recursive: true,
  });
  await writeFile(
    path.join(scenario.codexHome, "gonkagate", "token"),
    "gp-old-key\n",
    "utf8",
  );

  const outcome = await scenario.run();

  const backupPaths = outcome.writes
    .map((write) => write.backupPath)
    .filter((backupPath): backupPath is string => backupPath !== undefined);

  assert.equal(backupPaths.length >= 2, true);
  for (const backupPath of backupPaths) {
    const backupStats = await stat(backupPath);
    assert.equal(backupStats.isFile(), true);
  }

  const userConfig = parseToml(await readFile(outcome.userConfigPath, "utf8"));
  assert.equal(userConfig.model, DEFAULT_MODEL.modelId);
  assert.equal(
    (userConfig.analytics as Record<string, unknown>).enabled,
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
  initGitRepo(scenario.workspace);

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
          return {
            exists: false,
            filePath,
            settings: {},
            text: "",
          };
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
  const tokenPath = path.join(scenario.codexHome, "gonkagate", "token");
  const helperPath = createTokenCommandConfig({
    codexHome: scenario.codexHome,
    nodeExecutable: process.execPath,
    platform: process.platform,
    tokenPath,
  }).helperFilePath;
  await writeFile(
    path.join(scenario.codexHome, "config.toml"),
    'model = "openai"\n',
    "utf8",
  );
  await mkdir(path.join(scenario.codexHome, "gonkagate"), {
    recursive: true,
  });
  await writeFile(tokenPath, "gp-old-key\n", "utf8");

  const failingUserConfigPath = path.join(scenario.codexHome, "config.toml");
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
        [
          tokenPath,
          helperPath,
          path.join(scenario.codexHome, "model-catalogs", "gonkagate.json"),
        ],
      );
      assert.deepEqual(error.rollbackFailures, []);
      return true;
    },
  );

  assert.equal(await readFile(tokenPath, "utf8"), "gp-old-key\n");
  await assert.rejects(() => stat(helperPath), /ENOENT/);
  await assert.rejects(
    () =>
      stat(path.join(scenario.codexHome, "model-catalogs", "gonkagate.json")),
    /ENOENT/,
  );
  assert.equal(
    await readFile(path.join(scenario.codexHome, "config.toml"), "utf8"),
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
  initGitRepo(scenario.workspace);

  const outcome = await scenario.run({
    cwd: nestedDirectory,
  });

  assert.equal(outcome.projectRoot, scenario.workspace);
  assert.equal(outcome.trustTargetPath, scenario.workspace);
  assert.equal(
    outcome.projectConfigPath,
    path.join(scenario.workspace, ".codex", "config.toml"),
  );
});
