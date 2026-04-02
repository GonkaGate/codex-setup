import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MODEL_KEY } from "../src/constants/models.js";
import { parseCliOptions } from "../src/cli.js";

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
