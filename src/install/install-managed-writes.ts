import {
  createCuratedModelCatalog,
  type SupportedModel,
} from "../constants/models.js";
import {
  planInstallConfigWrites,
  type ConfigTarget,
  type PlannedConfigWrite,
} from "./codex-config.js";
import { OWNER_READ_WRITE_MODE } from "./file-permissions.js";
import type { InstallPaths, InstallScope } from "./settings-paths.js";
import {
  createManagedTomlConfigWrite,
  type LoadedTomlConfig,
} from "./toml-config.js";
import type { TokenCommandConfig } from "./token-helper.js";
import type { ManagedTextComparator } from "./write-managed-file.js";

export type ManagedWriteKind =
  | "token"
  | "token_helper"
  | "model_catalog"
  | "project_config"
  | "user_config";

export type InstallWritePhaseName = "catalog" | "config" | "credentials";

export interface ManagedWritePlan {
  content: string;
  contentComparator?: ManagedTextComparator;
  filePath: string;
  kind: ManagedWriteKind;
  mode: number;
}

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

const CONFIG_FILE_KIND_BY_TARGET = {
  project: "project_config",
  user: "user_config",
} as const satisfies Record<ConfigTarget, ManagedWriteKind>;

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
        OWNER_READ_WRITE_MODE,
      ),
      createWritePlan(
        "token_helper",
        input.tokenCommand.helperFilePath,
        input.tokenCommand.content,
        input.tokenCommand.fileMode,
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
        OWNER_READ_WRITE_MODE,
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
    CONFIG_FILE_KIND_BY_TARGET[configWrite.target],
    configWrite.filePath,
    managedTomlWrite.content,
    OWNER_READ_WRITE_MODE,
    managedTomlWrite.contentComparator,
  );
}

function createWritePlan(
  kind: ManagedWriteKind,
  filePath: string,
  content: string,
  mode: number,
  contentComparator?: ManagedTextComparator,
): ManagedWritePlan {
  return {
    content,
    contentComparator,
    filePath,
    kind,
    mode,
  };
}
