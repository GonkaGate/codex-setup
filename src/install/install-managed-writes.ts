import {
  createCuratedModelCatalog,
  type SupportedModel,
} from "../constants/models.js";
import {
  type ConfigFilePlanEntry,
  planInstallConfigWrites,
} from "./codex-config.js";
import { OWNER_READ_WRITE_MODE } from "./file-permissions.js";
import type { ConfigLayerTarget, ScopeConfigLayer } from "./install-scope.js";
import type { InstallPaths } from "./settings-paths.js";
import {
  createManagedTomlConfigWrite,
  type LoadedTomlConfig,
} from "./toml-config.js";
import type { TokenCommandConfig } from "./token-helper.js";
import type { ManagedTextComparator } from "./write-managed-file.js";

export type PlannedManagedWriteKind =
  | "token"
  | "token_helper"
  | "model_catalog"
  | "project_config"
  | "user_config";

export type PlannedManagedWritePhaseName = "catalog" | "config" | "credentials";

export interface PlannedManagedWrite {
  content: string;
  contentComparator?: ManagedTextComparator;
  filePath: string;
  kind: PlannedManagedWriteKind;
  mode: number;
}

export interface PlannedManagedWritePhase {
  name: PlannedManagedWritePhaseName;
  writes: readonly PlannedManagedWrite[];
}

export interface PlanInstallManagedWritesInput {
  apiKey: string;
  configLayers: readonly ScopeConfigLayer[];
  installPaths: InstallPaths;
  loadTomlConfig: (filePath: string) => Promise<LoadedTomlConfig>;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

const CONFIG_WRITE_KIND_BY_TARGET = {
  project: "project_config",
  user: "user_config",
} as const satisfies Record<ConfigLayerTarget, PlannedManagedWriteKind>;

export async function planInstallManagedWrites(
  input: PlanInstallManagedWritesInput,
): Promise<PlannedManagedWrite[]> {
  const phases = await planInstallManagedWritePhases(input);
  return phases.flatMap((phase) => phase.writes);
}

export async function planInstallManagedWritePhases(
  input: PlanInstallManagedWritesInput,
): Promise<PlannedManagedWritePhase[]> {
  return [
    {
      name: "credentials",
      writes: [planTokenManagedWrite(input), planHelperManagedWrite(input)],
    },
    {
      name: "catalog",
      writes: [planModelCatalogManagedWrite(input)],
    },
    // Commit and rollback semantics depend on this phase sequence staying explicit.
    {
      name: "config",
      writes: await planConfigManagedWrites(input),
    },
  ];
}

function planTokenManagedWrite(
  context: PlanInstallManagedWritesInput,
): PlannedManagedWrite {
  return createManagedWritePlan(
    "token",
    context.installPaths.tokenPath,
    `${context.apiKey}\n`,
    OWNER_READ_WRITE_MODE,
  );
}

function planHelperManagedWrite(
  context: PlanInstallManagedWritesInput,
): PlannedManagedWrite {
  return createManagedWritePlan(
    "token_helper",
    context.tokenCommand.helperFilePath,
    context.tokenCommand.content,
    context.tokenCommand.fileMode,
  );
}

function planModelCatalogManagedWrite(
  context: PlanInstallManagedWritesInput,
): PlannedManagedWrite {
  return createManagedWritePlan(
    "model_catalog",
    context.installPaths.modelCatalogPath,
    `${JSON.stringify(createCuratedModelCatalog(), null, 2)}\n`,
    OWNER_READ_WRITE_MODE,
  );
}

async function planConfigManagedWrites(
  context: PlanInstallManagedWritesInput,
): Promise<PlannedManagedWrite[]> {
  const configPlan = await planInstallConfigWrites({
    configLayers: context.configLayers,
    loadTomlConfig: context.loadTomlConfig,
    paths: context.installPaths,
    selectedModel: context.selectedModel,
    tokenCommand: context.tokenCommand,
  });

  return configPlan.map((entry) => prepareTomlConfigWrite(entry));
}

function prepareTomlConfigWrite(
  entry: ConfigFilePlanEntry,
): PlannedManagedWrite {
  const managedTomlWrite = createManagedTomlConfigWrite(entry.config);

  return createManagedWritePlan(
    CONFIG_WRITE_KIND_BY_TARGET[entry.target],
    entry.filePath,
    managedTomlWrite.content,
    OWNER_READ_WRITE_MODE,
    managedTomlWrite.contentComparator,
  );
}

function createManagedWritePlan(
  kind: PlannedManagedWriteKind,
  filePath: string,
  content: string,
  mode: number,
  contentComparator?: ManagedTextComparator,
): PlannedManagedWrite {
  return {
    content,
    contentComparator,
    filePath,
    kind,
    mode,
  };
}
