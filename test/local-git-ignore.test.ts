import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ensureLocalProjectConfigIgnored,
  findGitContext,
} from "../src/install/local-git-ignore.js";

async function createTempWorkspace(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `${prefix}-`));
}

test("findGitContext surfaces malformed gitdir markers", async () => {
  const workspace = await createTempWorkspace("codex-setup-git-context");
  await writeFile(path.join(workspace, ".git"), "not-a-gitdir\n", "utf8");

  await assert.rejects(
    () => findGitContext(workspace),
    /Could not resolve gitdir/,
  );
});

test("ensureLocalProjectConfigIgnored surfaces exclude read errors", async () => {
  const workspace = await createTempWorkspace("codex-setup-git-exclude");
  execFileSync("git", ["init", "--quiet"], {
    cwd: workspace,
  });

  const excludePath = path.join(workspace, ".git", "info", "exclude");
  await rm(excludePath, {
    force: true,
  });
  await mkdir(excludePath, {
    recursive: true,
  });

  await assert.rejects(
    () =>
      ensureLocalProjectConfigIgnored(
        path.join(workspace, ".codex", "config.toml"),
      ),
    /Failed to read .*\.git\/info\/exclude/,
  );
});
