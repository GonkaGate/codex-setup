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

interface ConfigPlanBuildContext {
  paths: ConfigPathsInput;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

type ConfigPatchBuilder = (context: ConfigPlanBuildContext) => TomlTable;

const CONFIG_FILE_PATH_RESOLVERS: Record<
  ConfigLayerTarget,
  (paths: ConfigLayerPaths) => string
> = {
  project: (paths) => paths.projectConfigPath,
  user: (paths) => paths.userConfigPath,
};

const CONFIG_PATCH_BUILDERS: Record<ConfigLayerRole, ConfigPatchBuilder> = {
  activation: buildActivationLayerPatch,
  provider: buildProviderLayerPatch,
  trust: buildLocalTrustLayerPatch,
};

export async function planInstallConfigWrites(
  input: PlanInstallConfigWritesInput,
): Promise<ConfigFilePlanEntry[]> {
  const context = createConfigPlanBuildContext(input);
  const plannedEntries: ConfigFilePlanEntry[] = [];

  for (const configLayer of input.configLayers) {
    const filePath = resolveConfigLayerFilePath(
      configLayer.target,
      input.paths,
    );
    const currentConfig = (await input.loadTomlConfig(filePath)).settings;
    const entry = buildConfigPlanEntry(configLayer, currentConfig, context);

    plannedEntries.push({
      ...entry,
      filePath,
    });
  }

  return plannedEntries;
}

export function buildInstallConfigPlan(
  input: BuildInstallConfigPlanInput,
): ConfigLayerPlanEntry[] {
  const context = createConfigPlanBuildContext(input);

  return input.configLayers.map((configLayer) =>
    buildConfigPlanEntry(
      configLayer,
      input.currentConfigs[configLayer.target] ?? {},
      context,
    ),
  );
}

function createConfigPlanBuildContext(
  input: Pick<
    BuildInstallConfigPlanInput,
    "paths" | "selectedModel" | "tokenCommand"
  >,
): ConfigPlanBuildContext {
  return {
    paths: input.paths,
    selectedModel: input.selectedModel,
    tokenCommand: input.tokenCommand,
  };
}

function buildConfigPlanEntry(
  configLayer: ScopeConfigLayer,
  currentConfig: TomlTable,
  context: ConfigPlanBuildContext,
): ConfigLayerPlanEntry {
  return {
    config: mergeTomlTables(
      currentConfig,
      buildConfigLayerPatch(configLayer, context),
    ),
    target: configLayer.target,
  };
}

function buildConfigLayerPatch(
  configLayer: ScopeConfigLayer,
  context: ConfigPlanBuildContext,
): TomlTable {
  return mergeTomlPatches(
    ...configLayer.roles.map((role) => CONFIG_PATCH_BUILDERS[role](context)),
  );
}

function resolveConfigLayerFilePath(
  target: ConfigLayerTarget,
  paths: ConfigLayerPaths,
): string {
  return CONFIG_FILE_PATH_RESOLVERS[target](paths);
}

function mergeTomlPatches(...patches: readonly TomlTable[]): TomlTable {
  let nextPatch: TomlTable = {};

  for (const patch of patches) {
    nextPatch = mergeTomlTables(nextPatch, patch);
  }

  return nextPatch;
}

function buildActivationLayerPatch(context: ConfigPlanBuildContext): TomlTable {
  return buildActivationConfigPatch(context.selectedModel, context.paths);
}

function buildProviderLayerPatch(context: ConfigPlanBuildContext): TomlTable {
  return buildProviderConfigPatch(context.paths, context.tokenCommand);
}

function buildLocalTrustLayerPatch(context: ConfigPlanBuildContext): TomlTable {
  return buildLocalTrustConfigPatch(context.paths.projectRoot);
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
