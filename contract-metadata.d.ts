export interface SupportedModelContract {
  readonly key: string;
  readonly displayName: string;
  readonly modelId: string;
  readonly description?: string;
  readonly isDefault?: boolean;
}

export interface ContractMetadata {
  readonly binName: string;
  readonly binPath: string;
  readonly cliVersion: string;
  readonly packageName: string;
  readonly publicEntrypoint: string;
  readonly supportedModels: readonly SupportedModelContract[];
  readonly verifiedCodex: {
    readonly minVersion: string;
    readonly modelCatalogVersion: string;
    readonly verifiedDate: string;
  };
}

export const CONTRACT_METADATA: ContractMetadata;
