import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import TOML from "@iarna/toml";
import {
  GONKAGATE_BASE_URL,
  GONKAGATE_PROVIDER_ID,
} from "../src/constants/gateway.js";
import { DEFAULT_MODEL } from "../src/constants/models.js";
import { createBackup } from "../src/install/backup.js";
import { loadTomlConfig } from "../src/install/codex-config.js";
import { InstallCommitError } from "../src/install/install-errors.js";
import { ensureLocalProjectConfigIgnored } from "../src/install/local-git-ignore.js";
import {
  defaultInstallUseCaseDependencies,
  runInstallUseCase,
  type InstallUseCaseDependencies,
} from "../src/install/install-use-case.js";
import { validateApiKey } from "../src/install/validate-api-key.js";
import {
  rollbackManagedTextFile,
  writeManagedTextFile,
} from "../src/install/write-managed-file.js";

interface InstallHarnessOptions {
  apiKey?: string;
  codeXVersion?: string;
  codexVersion?: string;
  codexHome: string;
  scope: "user" | "local";
  trackedLocalAction?: "user" | "cancel";
}

function createInstallDependencies(
  options: InstallHarnessOptions,
): InstallUseCaseDependencies {
  return {
    ...defaultInstallUseCaseDependencies,
    checkCodexAvailable: () => ({
      command: "codex",
      version: options.codexVersion ?? "0.118.0",
    }),
    createBackup,
    ensureLocalProjectConfigIgnored,
    environment: {
      ...process.env,
      CODEX_HOME: options.codexHome,
    },
    loadTomlConfig,
    nodeExecutable: process.execPath,
    platform: process.platform,
    promptForApiKey: async () => options.apiKey ?? "gp-test-key-123456",
    promptForModel: async () => DEFAULT_MODEL,
    promptForScope: async () => options.scope,
    promptForTrackedLocalConfigAction: async () =>
      options.trackedLocalAction ?? "cancel",
    rollbackManagedTextFile,
    validateApiKey,
    writeManagedTextFile,
  };
}

async function createTempWorkspace(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `${prefix}-`));
}

function parseToml(text: string): Record<string, unknown> {
  return TOML.parse(text) as Record<string, unknown>;
}

test("user scope writes GonkaGate provider, token helper, and curated catalog", async () => {
  const workspace = await createTempWorkspace("codex-setup-user-workspace");
  const codexHome = await createTempWorkspace("codex-setup-user-home");
  const dependencies = createInstallDependencies({
    codexHome,
    scope: "user",
  });

  const outcome = await runInstallUseCase(
    {
      cwd: workspace,
      scope: "user",
    },
    dependencies,
  );

  assert.equal(outcome.finalScope, "user");
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
  assert.equal(auth.cwd, codexHome);

  if (process.platform === "win32") {
    assert.equal(auth.command, process.execPath);
    assert.deepEqual(auth.args, [outcome.helperPath]);
  } else {
    assert.equal(auth.command, outcome.helperPath);
    assert.equal(auth.args, undefined);
  }

  assert.equal(
    (await readFile(outcome.tokenPath, "utf8")).trim(),
    "gp-test-key-123456",
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
  const workspace = await createTempWorkspace("codex-setup-local-workspace");
  const codexHome = await createTempWorkspace("codex-setup-local-home");
  execFileSync("git", ["init", "--quiet"], {
    cwd: workspace,
  });
  const dependencies = createInstallDependencies({
    codexHome,
    scope: "local",
  });

  const outcome = await runInstallUseCase(
    {
      cwd: workspace,
      scope: "local",
    },
    dependencies,
  );

  assert.equal(outcome.finalScope, "local");
  assert.equal(
    outcome.projectConfigPath,
    path.join(workspace, ".codex", "config.toml"),
  );
  assert.equal(outcome.trustTargetPath, workspace);

  const userConfig = parseToml(await readFile(outcome.userConfigPath, "utf8"));
  assert.equal(userConfig.model_provider, undefined);
  assert.equal(userConfig.model, undefined);

  const projects = userConfig.projects as Record<string, unknown>;
  const trustedProject = projects[workspace] as Record<string, unknown>;
  assert.equal(trustedProject.trust_level, "trusted");

  const projectConfig = parseToml(
    await readFile(outcome.projectConfigPath, "utf8"),
  );
  assert.equal(projectConfig.model_provider, GONKAGATE_PROVIDER_ID);
  assert.equal(projectConfig.model, DEFAULT_MODEL.modelId);
  assert.equal(projectConfig.model_catalog_json, outcome.modelCatalogPath);

  const excludePath = path.join(workspace, ".git", "info", "exclude");
  const excludeText = await readFile(excludePath, "utf8");
  assert.match(excludeText, /\/\.codex\/config\.toml/);
  assert.match(excludeText, /\/\.codex\/config\.toml\.backup-\*/);
});

test("tracked local config switches to user scope when requested", async () => {
  const workspace = await createTempWorkspace("codex-setup-tracked-workspace");
  const codexHome = await createTempWorkspace("codex-setup-tracked-home");
  execFileSync("git", ["init", "--quiet"], {
    cwd: workspace,
  });
  await mkdir(path.join(workspace, ".codex"), {
    recursive: true,
  });
  await writeFile(
    path.join(workspace, ".codex", "config.toml"),
    'model_provider = "openai"\n',
    "utf8",
  );
  execFileSync("git", ["add", ".codex/config.toml"], {
    cwd: workspace,
  });

  const dependencies = createInstallDependencies({
    codexHome,
    scope: "local",
    trackedLocalAction: "user",
  });

  const outcome = await runInstallUseCase(
    {
      cwd: workspace,
      scope: "local",
    },
    dependencies,
  );

  assert.equal(outcome.finalScope, "user");
  assert.equal(outcome.switchedToUserScope, true);
  assert.equal(outcome.projectConfigPath, undefined);
  assert.equal(
    await readFile(path.join(workspace, ".codex", "config.toml"), "utf8"),
    'model_provider = "openai"\n',
  );
});

test("existing user config and token files are preserved via backups before overwrite", async () => {
  const workspace = await createTempWorkspace("codex-setup-backup-workspace");
  const codexHome = await createTempWorkspace("codex-setup-backup-home");
  await mkdir(codexHome, {
    recursive: true,
  });
  await writeFile(
    path.join(codexHome, "config.toml"),
    ['model = "gpt-5.3-codex"', "", "[analytics]", "enabled = false", ""].join(
      "\n",
    ),
    "utf8",
  );
  await mkdir(path.join(codexHome, "gonkagate"), {
    recursive: true,
  });
  await writeFile(
    path.join(codexHome, "gonkagate", "token"),
    "gp-old-key\n",
    "utf8",
  );

  const dependencies = createInstallDependencies({
    apiKey: "gp-new-key-999999",
    codexHome,
    scope: "user",
  });

  const outcome = await runInstallUseCase(
    {
      cwd: workspace,
      scope: "user",
    },
    dependencies,
  );

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

test("prepare failures stop before any managed file writes begin", async () => {
  const workspace = await createTempWorkspace("codex-setup-prepare-workspace");
  const codexHome = await createTempWorkspace("codex-setup-prepare-home");
  execFileSync("git", ["init", "--quiet"], {
    cwd: workspace,
  });

  let loadCount = 0;
  let writeCount = 0;
  const dependencies: InstallUseCaseDependencies = {
    ...createInstallDependencies({
      codexHome,
      scope: "local",
    }),
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
    writeManagedTextFile: async () => {
      writeCount += 1;
      throw new Error("write should not be attempted");
    },
  };

  await assert.rejects(
    () =>
      runInstallUseCase(
        {
          cwd: workspace,
          scope: "local",
        },
        dependencies,
      ),
    /project config is invalid/,
  );

  assert.equal(loadCount, 2);
  assert.equal(writeCount, 0);
});

test("commit failures roll back completed managed writes and preserve prior files", async () => {
  const workspace = await createTempWorkspace("codex-setup-rollback-workspace");
  const codexHome = await createTempWorkspace("codex-setup-rollback-home");
  const helperPath = path.join(
    codexHome,
    "bin",
    process.platform === "win32" ? "gonkagate-token.js" : "gonkagate-token",
  );
  await writeFile(
    path.join(codexHome, "config.toml"),
    'model = "openai"\n',
    "utf8",
  );
  await mkdir(path.join(codexHome, "gonkagate"), {
    recursive: true,
  });
  await writeFile(
    path.join(codexHome, "gonkagate", "token"),
    "gp-old-key\n",
    "utf8",
  );

  const failingUserConfigPath = path.join(codexHome, "config.toml");
  const dependencies: InstallUseCaseDependencies = {
    ...createInstallDependencies({
      apiKey: "gp-new-key-999999",
      codexHome,
      scope: "user",
    }),
    writeManagedTextFile: async (filePath, content, options) => {
      if (filePath === failingUserConfigPath) {
        throw new Error("simulated config write failure");
      }

      return writeManagedTextFile(filePath, content, options);
    },
  };

  await assert.rejects(
    () =>
      runInstallUseCase(
        {
          cwd: workspace,
          scope: "user",
        },
        dependencies,
      ),
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
        error.completedWrites.map((write) => write.filePath).sort(),
        [
          path.join(codexHome, "gonkagate", "token"),
          helperPath,
          path.join(codexHome, "model-catalogs", "gonkagate.json"),
        ].sort(),
      );
      assert.deepEqual(error.rollbackFailures, []);
      return true;
    },
  );

  assert.equal(
    await readFile(path.join(codexHome, "gonkagate", "token"), "utf8"),
    "gp-old-key\n",
  );
  await assert.rejects(() => stat(helperPath), /ENOENT/);
  await assert.rejects(
    () => stat(path.join(codexHome, "model-catalogs", "gonkagate.json")),
    /ENOENT/,
  );
  assert.equal(
    await readFile(path.join(codexHome, "config.toml"), "utf8"),
    'model = "openai"\n',
  );
});

test("local scope resolves the git repo root even from nested directories", async () => {
  const workspace = await createTempWorkspace("codex-setup-nested-workspace");
  const codexHome = await createTempWorkspace("codex-setup-nested-home");
  const nestedDirectory = path.join(workspace, "packages", "cli");
  await mkdir(nestedDirectory, {
    recursive: true,
  });
  execFileSync("git", ["init", "--quiet"], {
    cwd: workspace,
  });

  const dependencies = createInstallDependencies({
    codexHome,
    scope: "local",
  });

  const outcome = await runInstallUseCase(
    {
      cwd: nestedDirectory,
      scope: "local",
    },
    dependencies,
  );

  assert.equal(outcome.projectRoot, workspace);
  assert.equal(outcome.trustTargetPath, workspace);
  assert.equal(
    outcome.projectConfigPath,
    path.join(workspace, ".codex", "config.toml"),
  );
});
