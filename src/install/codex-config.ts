import {
  GONKAGATE_BASE_URL,
  GONKAGATE_PROVIDER_ID,
  GONKAGATE_PROVIDER_NAME,
  TOKEN_COMMAND_TIMEOUT_MS,
  TOKEN_REFRESH_INTERVAL_MS,
} from "../constants/gateway.js";
import type { SupportedModel } from "../constants/models.js";
import type { InstallPaths } from "./settings-paths.js";
import type {
  ConfigLayerRole,
  ConfigLayerTarget,
  ScopeConfigLayer,
} from "./install-scope.js";
import {
  mergeTomlTables,
  type LoadedTomlConfig,
  type TomlTable,
} from "./toml-config.js";
import type { TokenCommandConfig } from "./token-helper.js";

export type ConfigPatchPaths = Pick<
  InstallPaths,
  "codexHome" | "modelCatalogPath" | "projectRoot"
>;

type ConfigFilePaths = Pick<
  InstallPaths,
  "projectConfigPath" | "userConfigPath"
>;

type InstallConfigPaths = ConfigPatchPaths & ConfigFilePaths;

export interface PlannedConfigTarget {
  config: TomlTable;
  target: ConfigLayerTarget;
}

export interface PlannedConfigWrite extends PlannedConfigTarget {
  filePath: string;
}

export interface BuildInstallConfigPlanInput {
  configLayers: readonly ScopeConfigLayer[];
  currentConfigsByTarget: Partial<Record<ConfigLayerTarget, TomlTable>>;
  paths: ConfigPatchPaths;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

export interface PlanInstallConfigWritesInput {
  configLayers: readonly ScopeConfigLayer[];
  loadTomlConfig: (filePath: string) => Promise<LoadedTomlConfig>;
  paths: InstallConfigPaths;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

export async function planInstallConfigWrites(
  input: PlanInstallConfigWritesInput,
): Promise<PlannedConfigWrite[]> {
  const currentConfigsByTarget = await loadCurrentConfigsByTarget(
    input.configLayers,
    input.paths,
    input.loadTomlConfig,
  );

  return buildInstallConfigPlan({
    configLayers: input.configLayers,
    currentConfigsByTarget,
    paths: input.paths,
    selectedModel: input.selectedModel,
    tokenCommand: input.tokenCommand,
  }).map((plannedConfig) => ({
    ...plannedConfig,
    filePath: resolveTargetConfigPath(plannedConfig.target, input.paths),
  }));
}

export function buildInstallConfigPlan(
  input: BuildInstallConfigPlanInput,
): PlannedConfigTarget[] {
  const targetsInWriteOrder = listConfigTargetsInWriteOrder(input.configLayers);
  const mergedConfigsByTarget = initializeMergedConfigsByTarget(
    targetsInWriteOrder,
    input.currentConfigsByTarget,
  );

  for (const configLayer of input.configLayers) {
    const currentConfig = mergedConfigsByTarget[configLayer.target] ?? {};
    mergedConfigsByTarget[configLayer.target] = mergeTomlTables(
      currentConfig,
      buildPatchForLayer(configLayer, input),
    );
  }

  return targetsInWriteOrder.map((target) => ({
    config: mergedConfigsByTarget[target] ?? {},
    target,
  }));
}

async function loadCurrentConfigsByTarget(
  configLayers: readonly ScopeConfigLayer[],
  paths: ConfigFilePaths,
  loadTomlConfig: (filePath: string) => Promise<LoadedTomlConfig>,
): Promise<Partial<Record<ConfigLayerTarget, TomlTable>>> {
  const currentConfigsByTarget: Partial<Record<ConfigLayerTarget, TomlTable>> =
    {};

  for (const target of listConfigTargetsInWriteOrder(configLayers)) {
    const filePath = resolveTargetConfigPath(target, paths);
    currentConfigsByTarget[target] = (await loadTomlConfig(filePath)).settings;
  }

  return currentConfigsByTarget;
}

function initializeMergedConfigsByTarget(
  targetsInWriteOrder: readonly ConfigLayerTarget[],
  currentConfigsByTarget: Partial<Record<ConfigLayerTarget, TomlTable>>,
): Partial<Record<ConfigLayerTarget, TomlTable>> {
  const mergedConfigsByTarget: Partial<Record<ConfigLayerTarget, TomlTable>> =
    {};

  for (const target of targetsInWriteOrder) {
    mergedConfigsByTarget[target] = currentConfigsByTarget[target] ?? {};
  }

  return mergedConfigsByTarget;
}

function listConfigTargetsInWriteOrder(
  configLayers: readonly ScopeConfigLayer[],
): ConfigLayerTarget[] {
  const targetsInWriteOrder: ConfigLayerTarget[] = [];

  for (const configLayer of configLayers) {
    if (!targetsInWriteOrder.includes(configLayer.target)) {
      targetsInWriteOrder.push(configLayer.target);
    }
  }

  return targetsInWriteOrder;
}

function buildPatchForLayer(
  configLayer: ScopeConfigLayer,
  input: Pick<
    BuildInstallConfigPlanInput,
    "paths" | "selectedModel" | "tokenCommand"
  >,
): TomlTable {
  let patch: TomlTable = {};

  for (const role of configLayer.roles) {
    patch = mergeTomlTables(patch, buildPatchForRole(role, input));
  }

  return patch;
}

function resolveTargetConfigPath(
  target: ConfigLayerTarget,
  paths: ConfigFilePaths,
): string {
  switch (target) {
    case "project":
      return paths.projectConfigPath;
    case "user":
      return paths.userConfigPath;
  }
}

function buildPatchForRole(
  role: ConfigLayerRole,
  input: Pick<
    BuildInstallConfigPlanInput,
    "paths" | "selectedModel" | "tokenCommand"
  >,
): TomlTable {
  switch (role) {
    case "activation":
      return buildActivationConfigPatch(input.selectedModel, input.paths);
    case "provider":
      return buildProviderConfigPatch(input.paths, input.tokenCommand);
    case "trust":
      return buildTrustConfigPatch(input.paths.projectRoot);
  }
}

function buildActivationConfigPatch(
  selectedModel: SupportedModel,
  paths: ConfigPatchPaths,
): TomlTable {
  return {
    model: selectedModel.modelId,
    model_catalog_json: paths.modelCatalogPath,
    model_provider: GONKAGATE_PROVIDER_ID,
  };
}

function buildProviderConfigPatch(
  paths: ConfigPatchPaths,
  tokenCommand: TokenCommandConfig,
): TomlTable {
  return {
    model_providers: {
      [GONKAGATE_PROVIDER_ID]: buildProviderConfig(paths, tokenCommand),
    },
  };
}

function buildTrustConfigPatch(projectRoot: string): TomlTable {
  return {
    projects: {
      [projectRoot]: {
        trust_level: "trusted",
      },
    },
  };
}

function buildProviderConfig(
  paths: ConfigPatchPaths,
  tokenCommand: TokenCommandConfig,
): TomlTable {
  const authConfig: TomlTable = {
    command: tokenCommand.command,
    cwd: paths.codexHome,
    refresh_interval_ms: TOKEN_REFRESH_INTERVAL_MS,
    timeout_ms: TOKEN_COMMAND_TIMEOUT_MS,
  };

  if (tokenCommand.args.length > 0) {
    authConfig.args = [...tokenCommand.args];
  }

  return {
    auth: authConfig,
    base_url: GONKAGATE_BASE_URL,
    name: GONKAGATE_PROVIDER_NAME,
    supports_websockets: false,
    wire_api: "responses",
  };
}
