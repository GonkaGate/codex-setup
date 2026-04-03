import type { SupportedModelContractDefinition } from "../../contract-definitions.js";
import { SUPPORTED_MODELS_CONTRACT } from "../../contract-definitions.js";
import {
  GONKAGATE_MODEL_CATALOG,
  type ModelCatalog,
  type ModelCatalogEntry,
} from "./model-catalog.js";

export type SupportedModelDefinition = SupportedModelContractDefinition;

const curatedModelRegistry = SUPPORTED_MODELS_CONTRACT;

export const SUPPORTED_MODELS = curatedModelRegistry;
export type SupportedModel = (typeof SUPPORTED_MODELS)[number];
export type SupportedModelKey = SupportedModel["key"];
export type SupportedModelId = SupportedModel["modelId"];
export const DEFAULT_MODEL = requireDefaultSupportedModel(SUPPORTED_MODELS);
export const DEFAULT_MODEL_KEY: SupportedModelKey = DEFAULT_MODEL.key;
export const SUPPORTED_MODEL_KEYS: readonly SupportedModelKey[] =
  SUPPORTED_MODELS.map((model) => model.key);
export const SUPPORTED_MODEL_IDS: readonly SupportedModelId[] =
  SUPPORTED_MODELS.map((model) => model.modelId);

export function findSupportedModelByKey(
  key: string,
): SupportedModel | undefined {
  return SUPPORTED_MODELS.find((model) => model.key === key);
}

export function parseSupportedModelKey(
  key: string,
): SupportedModelKey | undefined {
  return findSupportedModelByKey(key)?.key;
}

export function getSupportedModelByKey(key: SupportedModelKey): SupportedModel {
  return requireSupportedModel(key);
}

export function requireSupportedModel(key: SupportedModelKey): SupportedModel {
  const model = findSupportedModelByKey(key);

  if (!model) {
    throw new Error(
      `Unsupported model key "${key}". Supported model keys: ${SUPPORTED_MODEL_KEYS.join(", ")}`,
    );
  }

  return model;
}

export function getCatalogEntryForModel(
  modelId: SupportedModelId,
): ModelCatalogEntry {
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

function requireDefaultSupportedModel(
  models: readonly SupportedModelDefinition[],
): SupportedModel {
  const defaultModels = models.filter((model) => model.isDefault === true);

  if (defaultModels.length !== 1) {
    throw new Error(
      `Expected exactly one default supported model, found ${defaultModels.length}.`,
    );
  }

  const [defaultModel] = defaultModels;

  if (!defaultModel) {
    throw new Error("Expected a default supported model to be configured.");
  }

  return defaultModel;
}
