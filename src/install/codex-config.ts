import {
  GONKAGATE_BASE_URL,
  GONKAGATE_PROVIDER_ID,
  GONKAGATE_PROVIDER_NAME,
  TOKEN_COMMAND_TIMEOUT_MS,
  TOKEN_REFRESH_INTERVAL_MS,
} from "../constants/gateway.js";
import type { SupportedModel } from "../constants/models.js";
import type { InstallPaths, InstallScope } from "./settings-paths.js";
import {
  mergeTomlTables,
  type LoadedTomlConfig,
  type TomlTable,
} from "./toml-config.js";
import type { TokenCommandConfig } from "./token-helper.js";

export type ConfigTarget = "user" | "project";

export type InstallConfigPaths = Pick<
  InstallPaths,
  | "codexHome"
  | "modelCatalogPath"
  | "projectConfigPath"
  | "projectRoot"
  | "userConfigPath"
>;

interface CommonInstallConfigPlanInput {
  paths: InstallConfigPaths;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

type ExistingInstallConfigs = Partial<Record<ConfigTarget, TomlTable>>;

export interface PlannedConfigWrite {
  config: TomlTable;
  filePath: string;
  target: ConfigTarget;
}

export interface BuildInstallConfigPlanInput extends CommonInstallConfigPlanInput {
  existingConfigs: ExistingInstallConfigs;
  finalScope: InstallScope;
}

export interface PlanInstallConfigWritesInput extends CommonInstallConfigPlanInput {
  finalScope: InstallScope;
  loadTomlConfig: (filePath: string) => Promise<LoadedTomlConfig>;
}

interface InstallConfigLayer {
  filePath: string;
  patch: TomlTable;
  target: ConfigTarget;
}

export async function planInstallConfigWrites(
  input: PlanInstallConfigWritesInput,
): Promise<PlannedConfigWrite[]> {
  const configLayers = listInstallConfigLayers(input);
  const existingConfigs = await loadExistingInstallConfigs(
    configLayers,
    input.loadTomlConfig,
  );

  return buildInstallConfigPlan({
    ...input,
    existingConfigs,
  });
}

export function buildInstallConfigPlan(
  input: BuildInstallConfigPlanInput,
): PlannedConfigWrite[] {
  return listInstallConfigLayers(input).map((layer) =>
    createConfigWrite(
      layer.target,
      layer.filePath,
      mergeTomlTables(input.existingConfigs[layer.target] ?? {}, layer.patch),
    ),
  );
}

async function loadExistingInstallConfigs(
  configLayers: readonly InstallConfigLayer[],
  loadTomlConfig: (filePath: string) => Promise<LoadedTomlConfig>,
): Promise<ExistingInstallConfigs> {
  const existingConfigs: ExistingInstallConfigs = {};

  for (const layer of configLayers) {
    existingConfigs[layer.target] = (
      await loadTomlConfig(layer.filePath)
    ).settings;
  }

  return existingConfigs;
}

function listInstallConfigLayers(
  input: CommonInstallConfigPlanInput & { finalScope: InstallScope },
): InstallConfigLayer[] {
  if (input.finalScope === "user") {
    return [
      createConfigLayer(
        "user",
        input.paths.userConfigPath,
        buildUserScopeConfigTable(
          input.selectedModel,
          input.paths.modelCatalogPath,
          input.paths.codexHome,
          input.tokenCommand,
        ),
      ),
    ];
  }

  return [
    createConfigLayer(
      "user",
      input.paths.userConfigPath,
      buildLocalScopeUserConfigTable(
        input.paths.projectRoot,
        input.paths.codexHome,
        input.tokenCommand,
      ),
    ),
    createConfigLayer(
      "project",
      input.paths.projectConfigPath,
      buildLocalScopeProjectConfigTable(
        input.selectedModel,
        input.paths.modelCatalogPath,
      ),
    ),
  ];
}

function createConfigLayer(
  target: ConfigTarget,
  filePath: string,
  patch: TomlTable,
): InstallConfigLayer {
  return {
    filePath,
    patch,
    target,
  };
}

function createConfigWrite(
  target: ConfigTarget,
  filePath: string,
  config: TomlTable,
): PlannedConfigWrite {
  return {
    config,
    filePath,
    target,
  };
}

function buildUserScopeConfigTable(
  selectedModel: SupportedModel,
  modelCatalogPath: string,
  codexHome: string,
  tokenCommand: TokenCommandConfig,
): TomlTable {
  return mergeConfigTables(
    buildActivationConfigTable(selectedModel, modelCatalogPath),
    buildProviderConfigTable(codexHome, tokenCommand),
  );
}

function buildLocalScopeUserConfigTable(
  projectRoot: string,
  codexHome: string,
  tokenCommand: TokenCommandConfig,
): TomlTable {
  return mergeConfigTables(
    buildProviderConfigTable(codexHome, tokenCommand),
    buildTrustConfigTable(projectRoot),
  );
}

function buildLocalScopeProjectConfigTable(
  selectedModel: SupportedModel,
  modelCatalogPath: string,
): TomlTable {
  return buildActivationConfigTable(selectedModel, modelCatalogPath);
}

function mergeConfigTables(...configTables: readonly TomlTable[]): TomlTable {
  let mergedConfig: TomlTable = {};

  for (const configTable of configTables) {
    mergedConfig = mergeTomlTables(mergedConfig, configTable);
  }

  return mergedConfig;
}

function buildActivationConfigTable(
  selectedModel: SupportedModel,
  modelCatalogPath: string,
): TomlTable {
  return {
    model: selectedModel.modelId,
    model_catalog_json: modelCatalogPath,
    model_provider: GONKAGATE_PROVIDER_ID,
  };
}

function buildProviderConfigTable(
  codexHome: string,
  tokenCommand: TokenCommandConfig,
): TomlTable {
  const modelProviders: TomlTable = {};
  modelProviders[GONKAGATE_PROVIDER_ID] = buildGonkagateProviderTable(
    codexHome,
    tokenCommand,
  );

  return {
    model_providers: modelProviders,
  };
}

function buildTrustConfigTable(projectRoot: string): TomlTable {
  const projects: TomlTable = {};
  projects[projectRoot] = {
    trust_level: "trusted",
  };

  return {
    projects,
  };
}

function buildGonkagateProviderTable(
  codexHome: string,
  tokenCommand: TokenCommandConfig,
): TomlTable {
  return {
    auth: buildTokenAuthConfigTable(codexHome, tokenCommand),
    base_url: GONKAGATE_BASE_URL,
    name: GONKAGATE_PROVIDER_NAME,
    supports_websockets: false,
    wire_api: "responses",
  };
}

function buildTokenAuthConfigTable(
  codexHome: string,
  tokenCommand: TokenCommandConfig,
): TomlTable {
  const authConfig: TomlTable = {
    command: tokenCommand.command,
    cwd: codexHome,
    refresh_interval_ms: TOKEN_REFRESH_INTERVAL_MS,
    timeout_ms: TOKEN_COMMAND_TIMEOUT_MS,
  };

  if (tokenCommand.args.length > 0) {
    authConfig.args = [...tokenCommand.args];
  }

  return authConfig;
}
