import type { SupportedModelContractDefinition } from "../../contract-definitions.js";
import { SUPPORTED_MODELS_CONTRACT } from "../../contract-definitions.js";
import {
  GONKAGATE_MODEL_CATALOG,
  type ModelCatalog,
  type ModelCatalogEntry,
} from "./model-catalog.js";

export type SupportedModelDefinition = SupportedModelContractDefinition;

const curatedModelRegistry = SUPPORTED_MODELS_CONTRACT;

const defaultModels = curatedModelRegistry.filter((model) => model.isDefault);

if (defaultModels.length !== 1) {
  throw new Error(
    `Expected exactly one default supported model, found ${defaultModels.length}.`,
  );
}

export const SUPPORTED_MODELS = curatedModelRegistry;
export type SupportedModel = (typeof SUPPORTED_MODELS)[number];
export type SupportedModelKey = SupportedModel["key"];
export const DEFAULT_MODEL = defaultModels[0];
export const DEFAULT_MODEL_KEY: SupportedModelKey = DEFAULT_MODEL.key;
export const SUPPORTED_MODEL_KEYS: SupportedModelKey[] = SUPPORTED_MODELS.map(
  (model) => model.key,
);

export function getSupportedModelByKey(
  key: string,
): SupportedModel | undefined {
  return SUPPORTED_MODELS.find((model) => model.key === key);
}

export function requireSupportedModel(key: string): SupportedModel {
  const model = getSupportedModelByKey(key);

  if (!model) {
    throw new Error(
      `Unsupported model key "${key}". Supported model keys: ${SUPPORTED_MODEL_KEYS.join(", ")}`,
    );
  }

  return model;
}

export function getCatalogEntryForModel(modelId: string): ModelCatalogEntry {
  const modelEntry = GONKAGATE_MODEL_CATALOG.models.find(
    (entry) => entry.slug === modelId,
  );

  if (!modelEntry) {
    throw new Error(
      `Curated model catalog does not contain metadata for "${modelId}".`,
    );
  }

  return modelEntry;
}

export function createCuratedModelCatalog(): ModelCatalog {
  const models = SUPPORTED_MODELS.map((model) =>
    getCatalogEntryForModel(model.modelId),
  );

  if (models.length === 0) {
    throw new Error("Curated model catalog must contain at least one model.");
  }

  return { models };
}
