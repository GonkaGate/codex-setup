import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { findGitContext } from "../src/install/git-context.js";
import { createTempWorkspace } from "./helpers/workspace.js";

test("findGitContext surfaces malformed gitdir markers", async () => {
  const workspace = await createTempWorkspace("codex-setup-git-context");
  await writeFile(path.join(workspace, ".git"), "not-a-gitdir\n", "utf8");

  await assert.rejects(
    () => findGitContext(workspace),
    /Could not resolve gitdir/,
  );
});
