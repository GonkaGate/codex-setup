export type SupportedModelKey = string;

export interface SupportedModel {
  readonly displayName: string;
  readonly key: SupportedModelKey;
  readonly modelId: string;
}

export interface ModelCatalogEntry {
  readonly display_name: string;
  readonly input_modalities: readonly ["text"];
  readonly priority: number;
  readonly shell_type: "shell_command";
  readonly slug: string;
  readonly supported_in_api: true;
  readonly supported_reasoning_levels: readonly [];
  readonly visibility: "list";
}

export interface ModelCatalog {
  readonly models: readonly ModelCatalogEntry[];
}

export function createSupportedModel(
  id: string,
  name?: string,
): SupportedModel {
  const displayName = name && name.length > 0 ? name : id;

  return {
    displayName,
    key: id,
    modelId: id,
  };
}

export function getDefaultSupportedModel(
  models: readonly SupportedModel[],
): SupportedModel {
  const [defaultModel] = models;

  if (!defaultModel) {
    throw new Error("GonkaGate /v1/models returned no models.");
  }

  return defaultModel;
}

export function findSupportedModelByKey(
  models: readonly SupportedModel[],
  key: string,
): SupportedModel | undefined {
  return models.find((model) => model.key === key);
}

export function requireSupportedModel(
  models: readonly SupportedModel[],
  key: SupportedModelKey,
): SupportedModel {
  const model = findSupportedModelByKey(models, key);

  if (!model) {
    throw new Error(
      `Unsupported GonkaGate model id "${key}". Fetched model ids: ${models
        .map((supportedModel) => supportedModel.key)
        .join(", ")}`,
    );
  }

  return model;
}

export function createModelCatalog(
  models: readonly SupportedModel[],
): ModelCatalog {
  if (models.length === 0) {
    throw new Error("GonkaGate /v1/models returned no models.");
  }

  return {
    models: models.map((model, index) => ({
      display_name: model.displayName,
      input_modalities: ["text"],
      priority: index,
      shell_type: "shell_command",
      slug: model.modelId,
      supported_in_api: true,
      supported_reasoning_levels: [],
      visibility: "list",
    })),
  };
}
