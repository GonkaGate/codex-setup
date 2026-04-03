import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MODEL } from "../src/constants/models.js";
import {
  buildModelPromptConfig,
  buildScopePromptConfig,
  buildTrackedLocalConfigActionPromptConfig,
  promptForModel,
} from "../src/install/prompts.js";

test("buildModelPromptConfig keeps numbered-select defaults centralized", () => {
  const config = buildModelPromptConfig([DEFAULT_MODEL], DEFAULT_MODEL.key);

  assert.equal(config.default, DEFAULT_MODEL.key);
  assert.equal(config.loop, false);
  assert.equal(config.message, "Choose a GonkaGate model for Codex CLI");
  assert.equal(config.pageSize, 1);
  assert.equal(config.theme?.indexMode, "number");
  assert.equal(config.choices.length, 1);
  assert.equal(config.choices[0]?.short, DEFAULT_MODEL.key);
});

test("buildScopePromptConfig keeps scope prompt structure centralized", () => {
  const config = buildScopePromptConfig("user");

  assert.equal(config.default, "user");
  assert.equal(config.loop, false);
  assert.equal(config.message, "Choose where GonkaGate should be activated");
  assert.equal(config.pageSize, 2);
  assert.equal(config.theme?.indexMode, "number");
  assert.deepEqual(
    config.choices.map((choice) => choice.value),
    ["user", "local"],
  );
});

test("buildTrackedLocalConfigActionPromptConfig keeps tracked-file actions centralized", () => {
  const config =
    buildTrackedLocalConfigActionPromptConfig(".codex/config.toml");

  assert.equal(config.default, "user");
  assert.equal(config.loop, false);
  assert.equal(config.pageSize, 2);
  assert.equal(config.theme?.indexMode, "number");
  assert.match(
    config.message,
    /\.codex\/config\.toml is already tracked by git/,
  );
  assert.deepEqual(
    config.choices.map((choice) => choice.value),
    ["user", "cancel"],
  );
});

test("promptForModel bypasses the select prompt when only one model is supported", async () => {
  let selectCount = 0;

  const selectedModel = await promptForModel(
    [DEFAULT_MODEL],
    DEFAULT_MODEL.key,
    async () => {
      selectCount += 1;
      return DEFAULT_MODEL.key;
    },
  );

  assert.equal(selectCount, 0);
  assert.equal(selectedModel, DEFAULT_MODEL);
});
