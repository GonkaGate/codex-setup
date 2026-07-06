import assert from "node:assert/strict";
import test from "node:test";
import { GONKAGATE_BASE_URL } from "../src/constants/gateway.js";
import {
  fetchGonkagateModels,
  parseGonkagateModelsResponse,
} from "../src/install/model-discovery.js";
import { DEFAULT_TEST_API_KEY } from "./helpers/install-fixtures.js";

test("fetchGonkagateModels calls /v1/models with bearer auth", async () => {
  let capturedInit: RequestInit | undefined;
  const models = await fetchGonkagateModels(
    DEFAULT_TEST_API_KEY,
    async (url, init) => {
      assert.equal(url, `${GONKAGATE_BASE_URL}/models`);
      capturedInit = init;

      return new Response(
        JSON.stringify({
          data: [
            { id: "provider/live-codex-alpha", name: "Live Codex Alpha" },
            { id: "provider/live-codex-alpha" },
            { id: "provider/live-codex-beta" },
          ],
        }),
      );
    },
  );

  assert.deepEqual(
    models.map((model) => model.modelId),
    ["provider/live-codex-alpha", "provider/live-codex-beta"],
  );
  assert.equal(models[0]?.displayName, "Live Codex Alpha");
  assert.equal(
    (capturedInit?.headers as Record<string, string>).authorization,
    `Bearer ${DEFAULT_TEST_API_KEY}`,
  );
});

test("parseGonkagateModelsResponse rejects empty and invalid responses", () => {
  assert.throws(() => parseGonkagateModelsResponse({ data: [] }), /no models/);
  assert.throws(
    () => parseGonkagateModelsResponse({ data: [{ id: " " }] }),
    /must not be empty/,
  );
  assert.throws(
    () => parseGonkagateModelsResponse({ models: [] }),
    /"data" array/,
  );
});
