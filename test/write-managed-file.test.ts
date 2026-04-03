import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { areEquivalentTomlTexts } from "../src/install/toml-config.js";
import { writeManagedTextFile } from "../src/install/write-managed-file.js";
import { createTempWorkspace } from "./helpers/workspace.js";

test("contentComparator suppresses rewrites and backups for equivalent text", async () => {
  const workspace = await createTempWorkspace("codex-setup-managed-write");
  const filePath = path.join(workspace, "config.toml");
  await writeFile(filePath, 'model = "gpt-5.4"\r\n', "utf8");

  let backupCalls = 0;
  const result = await writeManagedTextFile(filePath, 'model = "gpt-5.4"\n', {
    backupFactory: async () => {
      backupCalls += 1;
      return path.join(workspace, "config.toml.backup");
    },
    contentComparator: areEquivalentTomlTexts,
  });

  assert.equal(result.changed, false);
  assert.equal(result.backupPath, undefined);
  assert.equal(backupCalls, 0);
  assert.equal(await readFile(filePath, "utf8"), 'model = "gpt-5.4"\r\n');
});

test("contentComparator still allows real changes to create backups", async () => {
  const workspace = await createTempWorkspace("codex-setup-managed-change");
  const filePath = path.join(workspace, "config.toml");
  const backupPath = path.join(workspace, "config.toml.backup");
  await writeFile(filePath, 'model = "gpt-5.4"\n', "utf8");

  let backupCalls = 0;
  const result = await writeManagedTextFile(filePath, 'model = "gpt-5.3"\n', {
    backupFactory: async () => {
      backupCalls += 1;
      return backupPath;
    },
    contentComparator: areEquivalentTomlTexts,
  });

  assert.equal(result.changed, true);
  assert.equal(result.backupPath, backupPath);
  assert.equal(backupCalls, 1);
  assert.equal(await readFile(filePath, "utf8"), 'model = "gpt-5.3"\n');
});
