import assert from "node:assert/strict";
import test from "node:test";
import {
  createModelCatalog,
  createSupportedModel,
} from "../src/constants/models.js";

test("createModelCatalog writes generic metadata for every fetched model", () => {
  const liveModels = [
    createSupportedModel("provider/live-codex-alpha", "Live Codex Alpha"),
    createSupportedModel("provider/live-codex-beta"),
  ];
  const modelCatalog = createModelCatalog(liveModels);

  assert.deepEqual(
    modelCatalog.models.map((model) => model.slug),
    liveModels.map((model) => model.modelId),
  );
  assert.deepEqual(
    modelCatalog.models.map((model) => model.display_name),
    ["Live Codex Alpha", "provider/live-codex-beta"],
  );
  assert.equal(modelCatalog.models[0]?.supported_in_api, true);
  assert.deepEqual(modelCatalog.models[0]?.input_modalities, ["text"]);
});

test("createModelCatalog rejects an empty live model list", () => {
  assert.throws(() => createModelCatalog([]), /returned no models/);
});
