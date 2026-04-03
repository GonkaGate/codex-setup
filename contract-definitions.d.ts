export interface SupportedModelContractDefinition {
  readonly key: string;
  readonly displayName: string;
  readonly modelId: string;
  readonly description?: string;
  readonly isDefault?: boolean;
}

export interface VerifiedCodexContractDefinition {
  readonly minVersion: string;
  readonly modelCatalogVersion: string;
  readonly verifiedDate: string;
}

export const SUPPORTED_MODELS_CONTRACT: readonly SupportedModelContractDefinition[];
export const VERIFIED_CODEX_CONTRACT: VerifiedCodexContractDefinition;
