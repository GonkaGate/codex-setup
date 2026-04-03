import { CONTRACT_METADATA } from "../../contract-metadata.js";
import {
  GONKAGATE_MODEL_CATALOG,
  type ModelCatalog,
  type ModelCatalogEntry,
} from "./model-catalog.js";

export interface SupportedModelDefinition {
  readonly key: string;
  readonly displayName: string;
  readonly modelId: string;
  readonly description?: string;
  readonly isDefault?: boolean;
}

const curatedModelRegistry = [
  {
    key: "gpt-5.4",
    displayName: "GPT-5.4",
    modelId: "gpt-5.4",
    description: "Current validated GonkaGate model for Codex CLI.",
    isDefault: true,
  },
] as const satisfies readonly SupportedModelDefinition[];

assertSupportedModelsMatchContract(
  curatedModelRegistry,
  CONTRACT_METADATA.supportedModels,
);

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

function assertSupportedModelsMatchContract(
  models: readonly SupportedModelDefinition[],
  contractModels: readonly SupportedModelDefinition[],
): void {
  if (models.length !== contractModels.length) {
    throw new Error(
      `Supported model registry length ${models.length} does not match CONTRACT_METADATA.supportedModels length ${contractModels.length}.`,
    );
  }

  for (const [index, model] of models.entries()) {
    const contractModel = contractModels[index];

    if (
      !contractModel ||
      model.key !== contractModel.key ||
      model.displayName !== contractModel.displayName ||
      model.modelId !== contractModel.modelId ||
      model.description !== contractModel.description ||
      Boolean(model.isDefault) !== Boolean(contractModel.isDefault)
    ) {
      throw new Error(
        `Supported model registry entry ${index} in src/constants/models.ts does not match CONTRACT_METADATA.supportedModels.`,
      );
    }
  }
}

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
