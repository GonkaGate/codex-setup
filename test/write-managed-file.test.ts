import assert from "node:assert/strict";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { areEquivalentTomlTexts } from "../src/install/toml-config.js";
import { writeManagedTextFile } from "../src/install/write-managed-file.js";
import { createTempWorkspace } from "./helpers/workspace.js";

test("contentComparator suppresses rewrites and backups for equivalent text", async () => {
  const workspace = await createTempWorkspace("codex-setup-managed-write");
  const filePath = path.join(workspace, "config.toml");
  await writeFile(filePath, 'model = "provider/live-codex-alpha"\r\n', "utf8");

  let backupCalls = 0;
  const result = await writeManagedTextFile(
    filePath,
    'model = "provider/live-codex-alpha"\n',
    {
      backupFactory: async () => {
        backupCalls += 1;
        return path.join(workspace, "config.toml.backup");
      },
      contentComparator: areEquivalentTomlTexts,
    },
  );

  assert.equal(result.changed, false);
  assert.equal(result.backupPath, undefined);
  assert.equal(backupCalls, 0);
  assert.equal(
    await readFile(filePath, "utf8"),
    'model = "provider/live-codex-alpha"\r\n',
  );
});

test("contentComparator still allows real changes to create backups", async () => {
  const workspace = await createTempWorkspace("codex-setup-managed-change");
  const filePath = path.join(workspace, "config.toml");
  const backupPath = path.join(workspace, "config.toml.backup");
  await writeFile(filePath, 'model = "provider/live-codex-alpha"\n', "utf8");

  let backupCalls = 0;
  const result = await writeManagedTextFile(
    filePath,
    'model = "provider/live-codex-beta"\n',
    {
      backupFactory: async () => {
        backupCalls += 1;
        return backupPath;
      },
      contentComparator: areEquivalentTomlTexts,
    },
  );

  assert.equal(result.changed, true);
  assert.equal(result.backupPath, backupPath);
  assert.equal(backupCalls, 1);
  assert.equal(
    await readFile(filePath, "utf8"),
    'model = "provider/live-codex-beta"\n',
  );
});

test("writeManagedTextFile rejects directory targets", async () => {
  const workspace = await createTempWorkspace("codex-setup-managed-directory");
  const filePath = path.join(workspace, "config.toml");
  await mkdir(filePath, {
    recursive: true,
  });

  await assert.rejects(
    () =>
      writeManagedTextFile(filePath, 'model = "provider/live-codex-alpha"\n'),
    /Refusing to overwrite directory/,
  );
});

test("writeManagedTextFile rejects symlink targets", async (t) => {
  if (process.platform === "win32") {
    t.skip("File symlink setup is not reliable on Windows CI.");
    return;
  }

  const workspace = await createTempWorkspace("codex-setup-managed-symlink");
  const realFilePath = path.join(workspace, "real-config.toml");
  const symlinkPath = path.join(workspace, "config.toml");
  await writeFile(
    realFilePath,
    'model = "provider/live-codex-alpha"\n',
    "utf8",
  );
  await symlink(realFilePath, symlinkPath, "file");

  await assert.rejects(
    () =>
      writeManagedTextFile(symlinkPath, 'model = "provider/live-codex-beta"\n'),
    /Refusing to overwrite symlink/,
  );
});
