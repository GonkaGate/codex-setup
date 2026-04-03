import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { CONTRACT_METADATA } from "../contract-metadata.js";
import { DEFAULT_MODEL_KEY } from "../src/constants/models.js";
import { parseCliOptions } from "../src/cli.js";
import { escapeRegExp, repoRoot } from "./contract-helpers.js";

test("parseCliOptions reads curated model and scope flags", () => {
  const options = parseCliOptions([
    "--scope",
    "local",
    "--model",
    DEFAULT_MODEL_KEY,
  ]);

  assert.equal(options.scope, "local");
  assert.equal(options.modelKey, DEFAULT_MODEL_KEY);
});

test("parseCliOptions rejects API key flags", () => {
  assert.throws(
    () => parseCliOptions(["--api-key", "gp-secret-value"]),
    /unsupported/i,
  );
});

test("CLI wrapper exposes the implemented installer entrypoint", () => {
  const binPath = resolve(repoRoot, CONTRACT_METADATA.binPath);
  const helpResult = spawnSync(process.execPath, [binPath, "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(helpResult.status, 0);
  assert.match(helpResult.stdout, /GonkaGate Codex CLI installer/i);
  assert.match(helpResult.stdout, /--scope <scope>/);
  assert.match(helpResult.stdout, /--model <model-key>/);
  assert.match(
    helpResult.stdout,
    new RegExp(escapeRegExp(CONTRACT_METADATA.publicEntrypoint)),
  );

  const versionResult = spawnSync(process.execPath, [binPath, "--version"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(versionResult.status, 0);
  assert.match(
    versionResult.stdout,
    new RegExp(escapeRegExp(CONTRACT_METADATA.cliVersion)),
  );
});
