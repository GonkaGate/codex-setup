import {
  createCuratedModelCatalog,
  type SupportedModel,
} from "../constants/models.js";
import {
  type ConfigFilePlanEntry,
  createManagedTomlConfigWrite,
  planInstallConfigWrites,
  type LoadedTomlConfig,
} from "./codex-config.js";
import { OWNER_READ_WRITE_MODE } from "./file-permissions.js";
import type { InstallPaths, InstallScope } from "./settings-paths.js";
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
  finalScope: InstallScope;
  installPaths: InstallPaths;
  loadTomlConfig: (filePath: string) => Promise<LoadedTomlConfig>;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

interface ManagedWritePlanningContext extends PlanInstallManagedWritesInput {}

export async function planInstallManagedWrites(
  input: PlanInstallManagedWritesInput,
): Promise<PlannedManagedWrite[]> {
  const phases = await planInstallManagedWritePhases(input);
  return phases.flatMap((phase) => phase.writes);
}

export async function planInstallManagedWritePhases(
  input: PlanInstallManagedWritesInput,
): Promise<PlannedManagedWritePhase[]> {
  // Keep the on-disk write sequence explicit so future additions do not have to
  // infer ordering from an indirection layer.
  return [
    createManagedWritePhase("credentials", [
      planTokenManagedWrite(input),
      planHelperManagedWrite(input),
    ]),
    createManagedWritePhase("catalog", [planModelCatalogManagedWrite(input)]),
    createManagedWritePhase("config", await planConfigManagedWrites(input)),
  ];
}

function planTokenManagedWrite(
  context: ManagedWritePlanningContext,
): PlannedManagedWrite {
  return createManagedWritePlan(
    "token",
    context.installPaths.tokenPath,
    `${context.apiKey}\n`,
    OWNER_READ_WRITE_MODE,
  );
}

function planHelperManagedWrite(
  context: ManagedWritePlanningContext,
): PlannedManagedWrite {
  return createManagedWritePlan(
    "token_helper",
    context.tokenCommand.helperFilePath,
    context.tokenCommand.content,
    context.tokenCommand.fileMode,
  );
}

function planModelCatalogManagedWrite(
  context: ManagedWritePlanningContext,
): PlannedManagedWrite {
  return createManagedWritePlan(
    "model_catalog",
    context.installPaths.modelCatalogPath,
    `${JSON.stringify(createCuratedModelCatalog(), null, 2)}\n`,
    OWNER_READ_WRITE_MODE,
  );
}

async function planConfigManagedWrites(
  context: ManagedWritePlanningContext,
): Promise<readonly PlannedManagedWrite[]> {
  const configPlan = await planInstallConfigWrites({
    finalScope: context.finalScope,
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
    entry.target === "user" ? "user_config" : "project_config",
    entry.filePath,
    managedTomlWrite.content,
    OWNER_READ_WRITE_MODE,
    managedTomlWrite.contentComparator,
  );
}

function createManagedWritePhase(
  name: PlannedManagedWritePhaseName,
  writes: readonly PlannedManagedWrite[],
): PlannedManagedWritePhase {
  return {
    name,
    writes,
  };
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
