import assert from "node:assert/strict";
import test from "node:test";
import { validateApiKey } from "../src/install/validate-api-key.js";

test("validateApiKey returns a trimmed gp-prefixed key", () => {
  assert.equal(validateApiKey("  gp-abc123456789  "), "gp-abc123456789");
});

test("validateApiKey rejects missing gp prefix", () => {
  assert.throws(
    () => validateApiKey("sk-not-gonkagate"),
    /must start with "gp-"/i,
  );
});

test("validateApiKey rejects empty input", () => {
  assert.throws(() => validateApiKey("   "), /required/i);
});
