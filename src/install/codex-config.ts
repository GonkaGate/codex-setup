import {
  GONKAGATE_BASE_URL,
  GONKAGATE_PROVIDER_ID,
  GONKAGATE_PROVIDER_NAME,
  TOKEN_COMMAND_TIMEOUT_MS,
  TOKEN_REFRESH_INTERVAL_MS,
} from "../constants/gateway.js";
import type { SupportedModel } from "../constants/models.js";
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

export interface ConfigPathsInput {
  codexHome: string;
  modelCatalogPath: string;
  projectRoot: string;
}

export interface ConfigLayerPaths {
  projectConfigPath: string;
  userConfigPath: string;
}

export interface ConfigLayerPlanEntry {
  config: TomlTable;
  target: ConfigLayerTarget;
}

export interface ConfigFilePlanEntry extends ConfigLayerPlanEntry {
  filePath: string;
}

export interface BuildInstallConfigPlanInput {
  configLayers: readonly ScopeConfigLayer[];
  currentConfigs: Partial<Record<ConfigLayerTarget, TomlTable>>;
  paths: ConfigPathsInput;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

export interface PlanInstallConfigWritesInput {
  configLayers: readonly ScopeConfigLayer[];
  loadTomlConfig: (filePath: string) => Promise<LoadedTomlConfig>;
  paths: ConfigPathsInput & ConfigLayerPaths;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

export async function planInstallConfigWrites(
  input: PlanInstallConfigWritesInput,
): Promise<ConfigFilePlanEntry[]> {
  const currentConfigs = await loadCurrentConfigsByTarget(
    input.configLayers,
    input.paths,
    input.loadTomlConfig,
  );

  return buildInstallConfigPlan({
    configLayers: input.configLayers,
    currentConfigs,
    paths: input.paths,
    selectedModel: input.selectedModel,
    tokenCommand: input.tokenCommand,
  }).map((entry) => ({
    ...entry,
    filePath: resolveConfigLayerFilePath(entry.target, input.paths),
  }));
}

export function buildInstallConfigPlan(
  input: BuildInstallConfigPlanInput,
): ConfigLayerPlanEntry[] {
  const targetsInOrder = getConfigLayerTargetsInOrder(input.configLayers);
  const plannedConfigsByTarget: Partial<Record<ConfigLayerTarget, TomlTable>> =
    initializeConfigsByTarget(targetsInOrder, input.currentConfigs);

  for (const configLayer of input.configLayers) {
    const currentConfig = plannedConfigsByTarget[configLayer.target] ?? {};
    plannedConfigsByTarget[configLayer.target] = mergeTomlTables(
      currentConfig,
      buildConfigLayerPatch(configLayer, input),
    );
  }

  return targetsInOrder.map((target) => ({
    config: plannedConfigsByTarget[target] ?? {},
    target,
  }));
}

async function loadCurrentConfigsByTarget(
  configLayers: readonly ScopeConfigLayer[],
  paths: ConfigLayerPaths,
  loadTomlConfig: (filePath: string) => Promise<LoadedTomlConfig>,
): Promise<Partial<Record<ConfigLayerTarget, TomlTable>>> {
  const currentConfigs: Partial<Record<ConfigLayerTarget, TomlTable>> = {};

  for (const target of getConfigLayerTargetsInOrder(configLayers)) {
    const filePath = resolveConfigLayerFilePath(target, paths);
    currentConfigs[target] = (await loadTomlConfig(filePath)).settings;
  }

  return currentConfigs;
}

function initializeConfigsByTarget(
  targetsInOrder: readonly ConfigLayerTarget[],
  currentConfigs: Partial<Record<ConfigLayerTarget, TomlTable>>,
): Partial<Record<ConfigLayerTarget, TomlTable>> {
  const configsByTarget: Partial<Record<ConfigLayerTarget, TomlTable>> = {};

  for (const target of targetsInOrder) {
    configsByTarget[target] = currentConfigs[target] ?? {};
  }

  return configsByTarget;
}

function getConfigLayerTargetsInOrder(
  configLayers: readonly ScopeConfigLayer[],
): ConfigLayerTarget[] {
  const targetsInOrder: ConfigLayerTarget[] = [];

  for (const configLayer of configLayers) {
    if (!targetsInOrder.includes(configLayer.target)) {
      targetsInOrder.push(configLayer.target);
    }
  }

  return targetsInOrder;
}

function buildConfigLayerPatch(
  configLayer: ScopeConfigLayer,
  input: Pick<
    BuildInstallConfigPlanInput,
    "paths" | "selectedModel" | "tokenCommand"
  >,
): TomlTable {
  let patch: TomlTable = {};

  for (const role of configLayer.roles) {
    patch = mergeTomlTables(patch, buildConfigPatchForRole(role, input));
  }

  return patch;
}

function resolveConfigLayerFilePath(
  target: ConfigLayerTarget,
  paths: ConfigLayerPaths,
): string {
  switch (target) {
    case "project":
      return paths.projectConfigPath;
    case "user":
      return paths.userConfigPath;
  }
}

function buildConfigPatchForRole(
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
      return buildLocalTrustConfigPatch(input.paths.projectRoot);
  }
}

function buildActivationConfigPatch(
  selectedModel: SupportedModel,
  paths: ConfigPathsInput,
): TomlTable {
  return {
    model: selectedModel.modelId,
    model_catalog_json: paths.modelCatalogPath,
    model_provider: GONKAGATE_PROVIDER_ID,
  };
}

function buildProviderConfigPatch(
  paths: ConfigPathsInput,
  tokenCommand: TokenCommandConfig,
): TomlTable {
  return {
    model_providers: {
      [GONKAGATE_PROVIDER_ID]: createProviderConfig(paths, tokenCommand),
    },
  };
}

function buildLocalTrustConfigPatch(projectRoot: string): TomlTable {
  return {
    projects: {
      [projectRoot]: {
        trust_level: "trusted",
      },
    },
  };
}

function createProviderConfig(
  paths: ConfigPathsInput,
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
