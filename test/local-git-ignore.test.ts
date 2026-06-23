import assert from "node:assert/strict";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { ensureLocalProjectConfigExcluded } from "../src/install/local-git-ignore.js";
import { inspectLocalProjectConfig } from "../src/install/local-project-config.js";
import { resolveLocalProjectConfigPath } from "../src/install/settings-paths.js";
import {
  createGitWorkspace,
  createTempWorkspace,
  trackLocalProjectConfig,
} from "./helpers/workspace.js";

test("inspectLocalProjectConfig reports when the project is outside git", async () => {
  const workspace = await createTempWorkspace("codex-setup-outside-git");

  const configInspection = await inspectLocalProjectConfig(
    resolveLocalProjectConfigPath(workspace),
  );

  assert.deepEqual(configInspection, {
    kind: "outside_repo",
  });
});

test("inspectLocalProjectConfig classifies tracked and untracked repo configs", async () => {
  const workspace = await createGitWorkspace("codex-setup-git-targets");

  const configPath = resolveLocalProjectConfigPath(workspace);
  let configInspection = await inspectLocalProjectConfig(configPath);
  assert.equal(configInspection.kind, "untracked");

  await trackLocalProjectConfig(workspace);

  configInspection = await inspectLocalProjectConfig(configPath);
  assert.equal(configInspection.kind, "tracked");
});

test("ensureLocalProjectConfigExcluded surfaces exclude read errors", async () => {
  const workspace = await createGitWorkspace("codex-setup-git-exclude");

  const excludePath = path.join(workspace, ".git", "info", "exclude");
  await rm(excludePath, {
    force: true,
  });
  await mkdir(excludePath, {
    recursive: true,
  });

  const configInspection = await inspectLocalProjectConfig(
    resolveLocalProjectConfigPath(workspace),
  );
  assert.equal(configInspection.kind, "untracked");

  await assert.rejects(
    () => ensureLocalProjectConfigExcluded(configInspection.excludeTarget),
    /Failed to read .*\.git\/info\/exclude/,
  );
});

test("ensureLocalProjectConfigExcluded is a no-op for tracked and outside-repo configs", async () => {
  const outsideWorkspace = await createTempWorkspace(
    "codex-setup-outside-git-noop",
  );
  const outsideInspection = await inspectLocalProjectConfig(
    resolveLocalProjectConfigPath(outsideWorkspace),
  );
  assert.equal(outsideInspection.kind, "outside_repo");
  await assert.doesNotReject(() => ensureLocalProjectConfigExcluded(undefined));

  const trackedWorkspace = await createGitWorkspace(
    "codex-setup-git-exclude-noop",
  );
  await trackLocalProjectConfig(trackedWorkspace);

  const trackedInspection = await inspectLocalProjectConfig(
    resolveLocalProjectConfigPath(trackedWorkspace),
  );
  assert.equal(trackedInspection.kind, "tracked");

  const excludePath = path.join(trackedWorkspace, ".git", "info", "exclude");
  await writeFile(excludePath, "# existing\n", "utf8");
  const initialExcludeText = await readFile(excludePath, "utf8");

  await assert.doesNotReject(() => ensureLocalProjectConfigExcluded(undefined));
  assert.equal(await readFile(excludePath, "utf8"), initialExcludeText);
});

test("inspectLocalProjectConfig rejects a symlinked .codex directory", async (t) => {
  if (process.platform === "win32") {
    t.skip("Directory symlink setup is not reliable on Windows CI.");
    return;
  }

  const workspace = await createGitWorkspace("codex-setup-symlink-dir");

  const configDirectory = path.dirname(
    resolveLocalProjectConfigPath(workspace),
  );
  const realCodexDirectory = path.join(workspace, "real-codex");
  await mkdir(realCodexDirectory, {
    recursive: true,
  });
  await symlink(realCodexDirectory, configDirectory, "dir");

  await assert.rejects(
    () => inspectLocalProjectConfig(resolveLocalProjectConfigPath(workspace)),
    /symlinked ".codex" directory/,
  );
});

test("inspectLocalProjectConfig rejects a symlinked config file", async (t) => {
  if (process.platform === "win32") {
    t.skip("File symlink setup is not reliable on Windows CI.");
    return;
  }

  const workspace = await createGitWorkspace("codex-setup-symlink-file");

  const configPath = resolveLocalProjectConfigPath(workspace);
  const configDirectory = path.dirname(configPath);
  const realConfigPath = path.join(workspace, "real-config.toml");
  await mkdir(configDirectory, {
    recursive: true,
  });
  await writeFile(realConfigPath, 'model_provider = "openai"\n', "utf8");
  await symlink(realConfigPath, configPath, "file");

  await assert.rejects(
    () => inspectLocalProjectConfig(resolveLocalProjectConfigPath(workspace)),
    /symlinked file/,
  );
});
