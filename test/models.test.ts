import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CONTRACT_METADATA } from "../contract-metadata.js";
import {
  SUPPORTED_MODELS,
  createCuratedModelCatalog,
} from "../src/constants/models.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

test("createCuratedModelCatalog includes every supported model", () => {
  const curatedCatalog = createCuratedModelCatalog();

  assert.deepEqual(
    curatedCatalog.models.map((model) => model.slug),
    SUPPORTED_MODELS.map((model) => model.modelId),
  );
  assert.equal(
    curatedCatalog.models.length,
    CONTRACT_METADATA.supportedModels.length,
  );
  assert.deepEqual(SUPPORTED_MODELS, CONTRACT_METADATA.supportedModels);
});

test("generated model-catalog artifact matches the committed source snapshot", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(repoRoot, "scripts/check-model-catalog.mjs")],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
});
