import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_PROJECT_CONFIG_RELATIVE_PATH } from "../src/install/settings-paths.js";
import {
  buildModelPromptConfig,
  buildScopePromptConfig,
  buildTrackedLocalConfigActionPromptConfig,
  promptForModel,
  promptForScope,
  promptForTrackedLocalConfigAction,
} from "../src/install/prompts.js";
import { DEFAULT_TEST_MODEL, TEST_MODELS } from "./helpers/install-fixtures.js";

test("buildModelPromptConfig keeps numbered-select defaults centralized", () => {
  const config = buildModelPromptConfig(TEST_MODELS, DEFAULT_TEST_MODEL.key);

  assert.equal(config.default, DEFAULT_TEST_MODEL.key);
  assert.equal(config.loop, false);
  assert.equal(config.message, "Choose a GonkaGate model for Codex CLI");
  assert.equal(config.pageSize, TEST_MODELS.length);
  assert.equal(config.theme?.indexMode, "number");
  assert.equal(config.choices.length, TEST_MODELS.length);
  assert.equal(config.choices[0]?.short, DEFAULT_TEST_MODEL.key);
  assert.deepEqual(
    config.choices.map((choice) => choice.value),
    TEST_MODELS.map((model) => model.key),
  );
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
  const config = buildTrackedLocalConfigActionPromptConfig(
    LOCAL_PROJECT_CONFIG_RELATIVE_PATH,
  );

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
    [DEFAULT_TEST_MODEL],
    DEFAULT_TEST_MODEL.key,
    async () => {
      selectCount += 1;
      return DEFAULT_TEST_MODEL.key;
    },
  );

  assert.equal(selectCount, 0);
  assert.equal(selectedModel, DEFAULT_TEST_MODEL);
});

test("promptForScope accepts injected runners without requiring local TTY checks", async () => {
  const selectedScope = await promptForScope("user", async () => "local");

  assert.equal(selectedScope, "local");
});

test("promptForTrackedLocalConfigAction accepts injected runners without requiring local TTY checks", async () => {
  const action = await promptForTrackedLocalConfigAction(
    LOCAL_PROJECT_CONFIG_RELATIVE_PATH,
    async () => "cancel",
  );

  assert.equal(action, "cancel");
});
