import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CONTRACT_METADATA } from "../contract-metadata.js";
import { readText } from "./contract-helpers.js";
import {
  expectJsonString,
  expectJsonStringRecord,
  parseJsonObject,
} from "./helpers/structured-data.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

test("package metadata matches the installer contract", () => {
  const packageJson = parseJsonObject(readText("package.json"), "package.json");
  const packageJsonBin = expectJsonStringRecord(
    packageJson.bin,
    "packageJson.bin",
  );
  const packageJsonScripts = expectJsonStringRecord(
    packageJson.scripts,
    "packageJson.scripts",
  );

  assert.equal(
    expectJsonString(packageJson.name, "packageJson.name"),
    CONTRACT_METADATA.packageName,
  );
  assert.equal(
    expectJsonString(packageJson.type, "packageJson.type"),
    "module",
  );
  assert.equal(
    expectJsonString(packageJson.version, "packageJson.version"),
    CONTRACT_METADATA.cliVersion,
  );
  assert.equal(
    packageJsonBin[CONTRACT_METADATA.binName],
    CONTRACT_METADATA.binPath,
  );
  assert.match(
    packageJsonScripts["model-catalog:generate"],
    /scripts\/extract-model-catalog\.mjs/,
  );
  assert.match(
    packageJsonScripts["contract:generate"],
    /scripts\/generate-contract-files\.mjs/,
  );
  assert.match(
    packageJsonScripts["contract:check"],
    /scripts\/check-contract-files\.mjs/,
  );
  assert.match(
    packageJsonScripts["model-catalog:check"],
    /scripts\/check-model-catalog\.mjs/,
  );
  assert.match(packageJsonScripts.test, /npm run build/);
  assert.match(packageJsonScripts.ci, /npm run typecheck/);
  assert.match(packageJsonScripts.ci, /npm run test/);
  assert.match(packageJsonScripts.ci, /npm run contract:check/);
  assert.match(packageJsonScripts.ci, /npm run model-catalog:check/);
  assert.match(packageJsonScripts.ci, /npm run package:check/);
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
