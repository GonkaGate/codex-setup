import type {
  SupportedModelContractDefinition,
  VerifiedCodexContractDefinition,
} from "./contract-definitions.js";

export interface ContractMetadata {
  readonly binName: string;
  readonly binPath: string;
  readonly cliVersion: string;
  readonly packageName: string;
  readonly publicEntrypoint: string;
  readonly supportedModels: readonly SupportedModelContractDefinition[];
  readonly verifiedCodex: VerifiedCodexContractDefinition;
}

export const CONTRACT_METADATA: ContractMetadata;
