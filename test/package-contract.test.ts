import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CONTRACT_METADATA } from "../contract-metadata.js";
import { readText } from "./contract-helpers.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

test("package metadata matches the installer contract", () => {
  const packageJson = JSON.parse(readText("package.json")) as {
    bin: Record<string, string>;
    name: string;
    scripts: Record<string, string>;
    type: string;
    version: string;
  };

  assert.equal(packageJson.name, CONTRACT_METADATA.packageName);
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.version, CONTRACT_METADATA.cliVersion);
  assert.equal(
    packageJson.bin[CONTRACT_METADATA.binName],
    CONTRACT_METADATA.binPath,
  );
  assert.match(
    packageJson.scripts["model-catalog:generate"],
    /scripts\/extract-model-catalog\.mjs/,
  );
  assert.match(
    packageJson.scripts["contract:generate"],
    /scripts\/generate-contract-files\.mjs/,
  );
  assert.match(
    packageJson.scripts["contract:check"],
    /scripts\/check-contract-files\.mjs/,
  );
  assert.match(
    packageJson.scripts["model-catalog:check"],
    /scripts\/check-model-catalog\.mjs/,
  );
  assert.match(packageJson.scripts.test, /npm run build/);
  assert.match(packageJson.scripts.ci, /npm run typecheck/);
  assert.match(packageJson.scripts.ci, /npm run test/);
  assert.match(packageJson.scripts.ci, /npm run contract:check/);
  assert.match(packageJson.scripts.ci, /npm run model-catalog:check/);
  assert.match(packageJson.scripts.ci, /npm run package:check/);
});

test("generated contract artifacts match their committed source snapshots", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(repoRoot, "scripts/check-contract-files.mjs")],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
