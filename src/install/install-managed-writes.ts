import {
  createCuratedModelCatalog,
  type SupportedModel,
} from "../constants/models.js";
import {
  planInstallConfigWrites,
  type PlannedConfigWrite,
} from "./codex-config.js";
import { OWNER_READ_WRITE_MODE } from "./file-permissions.js";
import type { InstallPaths, InstallScope } from "./settings-paths.js";
import {
  createManagedTomlConfigWrite,
  type LoadedTomlConfig,
} from "./toml-config.js";
import type { TokenCommandConfig } from "./token-helper.js";
import type { ManagedWriteOptions } from "./write-managed-file.js";

export type ManagedWriteKind =
  | "token"
  | "token_helper"
  | "model_catalog"
  | "project_config"
  | "user_config";

export type InstallWritePhaseName = "catalog" | "config" | "credentials";

export interface ManagedWritePlan {
  content: string;
  filePath: string;
  kind: ManagedWriteKind;
  writeOptions: PlannedManagedWriteOptions;
}

type PlannedManagedWriteOptions = Omit<ManagedWriteOptions, "backupFactory">;

export interface InstallWritePhase {
  name: InstallWritePhaseName;
  writes: readonly ManagedWritePlan[];
}

export interface PlanInstallManagedWritesInput {
  apiKey: string;
  finalScope: InstallScope;
  installPaths: InstallPaths;
  loadTomlConfig: (filePath: string) => Promise<LoadedTomlConfig>;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

export async function planInstallManagedWrites(
  input: PlanInstallManagedWritesInput,
): Promise<ManagedWritePlan[]> {
  return (await planInstallManagedWritePhases(input)).flatMap(
    (phase) => phase.writes,
  );
}

export async function planInstallManagedWritePhases(
  input: PlanInstallManagedWritesInput,
): Promise<InstallWritePhase[]> {
  // Commit and rollback semantics depend on this phase sequence staying explicit.
  return [
    planCredentialWritePhase(input),
    planCatalogWritePhase(input),
    await planConfigWritePhase(input),
  ];
}

function planCredentialWritePhase(
  input: PlanInstallManagedWritesInput,
): InstallWritePhase {
  return {
    name: "credentials",
    writes: [
      createWritePlan(
        "token",
        input.installPaths.tokenPath,
        `${input.apiKey}\n`,
        {
          mode: OWNER_READ_WRITE_MODE,
        },
      ),
      createWritePlan(
        "token_helper",
        input.tokenCommand.helperFilePath,
        input.tokenCommand.content,
        {
          mode: input.tokenCommand.fileMode,
        },
      ),
    ],
  };
}

function planCatalogWritePhase(
  input: PlanInstallManagedWritesInput,
): InstallWritePhase {
  return {
    name: "catalog",
    writes: [
      createWritePlan(
        "model_catalog",
        input.installPaths.modelCatalogPath,
        `${JSON.stringify(createCuratedModelCatalog(), null, 2)}\n`,
        {
          mode: OWNER_READ_WRITE_MODE,
        },
      ),
    ],
  };
}

async function planConfigWritePhase(
  input: PlanInstallManagedWritesInput,
): Promise<InstallWritePhase> {
  const configWrites = await planInstallConfigWrites({
    finalScope: input.finalScope,
    loadTomlConfig: input.loadTomlConfig,
    paths: input.installPaths,
    selectedModel: input.selectedModel,
    tokenCommand: input.tokenCommand,
  });

  return {
    name: "config",
    writes: configWrites.map(toManagedConfigWrite),
  };
}

function toManagedConfigWrite(
  configWrite: PlannedConfigWrite,
): ManagedWritePlan {
  const managedTomlWrite = createManagedTomlConfigWrite(configWrite.config);

  return createWritePlan(
    configWrite.writeKind,
    configWrite.filePath,
    managedTomlWrite.content,
    {
      contentComparator: managedTomlWrite.contentComparator,
      mode: OWNER_READ_WRITE_MODE,
    },
  );
}

function createWritePlan(
  kind: ManagedWriteKind,
  filePath: string,
  content: string,
  writeOptions: PlannedManagedWriteOptions,
): ManagedWritePlan {
  return {
    content,
    filePath,
    kind,
    writeOptions,
  };
}
