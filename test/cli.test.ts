import assert from "node:assert/strict";
import test from "node:test";
import { parseCliOptions } from "../src/cli.js";

test("parseCliOptions reads curated model and scope flags", () => {
  const options = parseCliOptions(["--scope", "local", "--model", "gpt-5.4"]);

  assert.equal(options.scope, "local");
  assert.equal(options.modelKey, "gpt-5.4");
});

test("parseCliOptions rejects API key flags", () => {
  assert.throws(
    () => parseCliOptions(["--api-key", "gp-secret-value"]),
    /unsupported/i,
  );
});
