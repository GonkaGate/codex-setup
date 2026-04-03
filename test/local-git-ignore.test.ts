import assert from "node:assert/strict";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  ensureLocalProjectConfigExcluded,
  inspectLocalProjectConfig,
} from "../src/install/local-git-ignore.js";
import {
  createTempWorkspace,
  initGitRepo,
  trackLocalProjectConfig,
} from "./helpers/workspace.js";

test("inspectLocalProjectConfig reports when the project is outside git", async () => {
  const workspace = await createTempWorkspace("codex-setup-outside-git");

  const configInspection = await inspectLocalProjectConfig(
    path.join(workspace, ".codex", "config.toml"),
  );

  assert.deepEqual(configInspection, {
    kind: "outside_repo",
  });
});

test("inspectLocalProjectConfig classifies tracked and untracked repo configs", async () => {
  const workspace = await createTempWorkspace("codex-setup-git-targets");
  initGitRepo(workspace);

  const configPath = path.join(workspace, ".codex", "config.toml");
  let configInspection = await inspectLocalProjectConfig(configPath);
  assert.equal(configInspection.kind, "untracked");

  await trackLocalProjectConfig(workspace);

  configInspection = await inspectLocalProjectConfig(configPath);
  assert.equal(configInspection.kind, "tracked");
});

test("ensureLocalProjectConfigExcluded surfaces exclude read errors", async () => {
  const workspace = await createTempWorkspace("codex-setup-git-exclude");
  initGitRepo(workspace);

  const excludePath = path.join(workspace, ".git", "info", "exclude");
  await rm(excludePath, {
    force: true,
  });
  await mkdir(excludePath, {
    recursive: true,
  });

  const configInspection = await inspectLocalProjectConfig(
    path.join(workspace, ".codex", "config.toml"),
  );
  assert.equal(configInspection.kind, "untracked");

  await assert.rejects(
    () => ensureLocalProjectConfigExcluded(configInspection),
    /Failed to read .*\.git\/info\/exclude/,
  );
});

test("inspectLocalProjectConfig rejects a symlinked .codex directory", async (t) => {
  if (process.platform === "win32") {
    t.skip("Directory symlink setup is not reliable on Windows CI.");
    return;
  }

  const workspace = await createTempWorkspace("codex-setup-symlink-dir");
  initGitRepo(workspace);

  const realCodexDirectory = path.join(workspace, "real-codex");
  await mkdir(realCodexDirectory, {
    recursive: true,
  });
  await symlink(realCodexDirectory, path.join(workspace, ".codex"), "dir");

  await assert.rejects(
    () =>
      inspectLocalProjectConfig(path.join(workspace, ".codex", "config.toml")),
    /symlinked ".codex" directory/,
  );
});

test("inspectLocalProjectConfig rejects a symlinked config file", async (t) => {
  if (process.platform === "win32") {
    t.skip("File symlink setup is not reliable on Windows CI.");
    return;
  }

  const workspace = await createTempWorkspace("codex-setup-symlink-file");
  initGitRepo(workspace);

  const configDirectory = path.join(workspace, ".codex");
  const realConfigPath = path.join(workspace, "real-config.toml");
  await mkdir(configDirectory, {
    recursive: true,
  });
  await writeFile(realConfigPath, 'model_provider = "openai"\n', "utf8");
  await symlink(
    realConfigPath,
    path.join(configDirectory, "config.toml"),
    "file",
  );

  await assert.rejects(
    () =>
      inspectLocalProjectConfig(path.join(workspace, ".codex", "config.toml")),
    /symlinked file/,
  );
});
