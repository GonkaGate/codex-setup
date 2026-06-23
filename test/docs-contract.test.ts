import test from "node:test";
import { CONTRACT_METADATA } from "../contract-metadata.js";
import {
  GONKAGATE_BASE_URL,
  GONKAGATE_PROVIDER_ID,
} from "../src/constants/gateway.js";
import {
  assertMatchesAll,
  escapeRegExp,
  readText,
} from "./contract-helpers.js";

test("README captures the current Codex installer decisions", () => {
  const readme = readText("README.md");

  assertMatchesAll(readme, [
    new RegExp(escapeRegExp(CONTRACT_METADATA.publicEntrypoint)),
    /~\/\.codex\/config\.toml/,
    /\.codex\/config\.toml/,
    new RegExp(escapeRegExp(`model_provider = "${GONKAGATE_PROVIDER_ID}"`)),
    new RegExp(escapeRegExp(GONKAGATE_BASE_URL)),
    /wire_api = "responses"/,
    /model_catalog_json/,
    /command-backed bearer token/i,
    new RegExp(escapeRegExp(CONTRACT_METADATA.verifiedCodex.minVersion)),
  ]);

  for (const model of CONTRACT_METADATA.supportedModels) {
    assertMatchesAll(readme, [new RegExp(escapeRegExp(model.modelId))]);
  }
});

test("AGENTS captures the repository contract anchors", () => {
  const agents = readText("AGENTS.md");

  assertMatchesAll(agents, [
    new RegExp(escapeRegExp(CONTRACT_METADATA.packageName)),
    /src\/cli\.ts/,
    /~\/\.codex\/config\.toml/,
    /\.codex\/config\.toml/,
    new RegExp(escapeRegExp(`model_provider = "${GONKAGATE_PROVIDER_ID}"`)),
    /wire_api = "responses"/,
    /auth\.json/,
    /installer is implemented/i,
    new RegExp(escapeRegExp(CONTRACT_METADATA.verifiedCodex.minVersion)),
    /test\/docs-contract\.test\.ts/,
  ]);
});

test("implementation docs capture current install and troubleshooting anchors", () => {
  const howItWorks = readText("docs/how-it-works.md");
  const troubleshooting = readText("docs/troubleshooting.md");

  assertMatchesAll(howItWorks, [
    new RegExp(escapeRegExp(CONTRACT_METADATA.publicEntrypoint)),
    new RegExp(escapeRegExp(CONTRACT_METADATA.verifiedCodex.minVersion)),
    /wire_api = "responses"/,
    /model_catalog_json/,
  ]);

  assertMatchesAll(troubleshooting, [
    new RegExp(escapeRegExp(CONTRACT_METADATA.verifiedCodex.minVersion)),
    /openai_base_url/,
    /projects\."\s*<abs-path>\s*"\.trust_level = "trusted"|projects\."\<abs-path\>"\.trust_level = "trusted"/,
    /wire_api = "responses"/,
    /\.codex\/config\.toml/,
  ]);
});

test("security docs capture the secret-handling constraints", () => {
  const security = readText("docs/security.md");

  assertMatchesAll(security, [
    /auth\.json/,
    /owner-only permissions/i,
    /~\/\.codex/,
    /\.git\/info\/exclude/,
  ]);
});
