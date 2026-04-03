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

interface ExistingInstallConfigs {
  projectConfig?: TomlTable;
  userConfig: TomlTable;
}

export interface PlannedConfigWrite {
  config: TomlTable;
  filePath: string;
  target: ConfigTarget;
}

export interface BuildInstallConfigPlanInput {
  existingConfigs: ExistingInstallConfigs;
  finalScope: InstallScope;
  paths: InstallConfigPaths;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

export interface PlanInstallConfigWritesInput extends Omit<
  BuildInstallConfigPlanInput,
  "existingConfigs"
> {
  loadTomlConfig: (filePath: string) => Promise<LoadedTomlConfig>;
}

export async function planInstallConfigWrites(
  input: PlanInstallConfigWritesInput,
): Promise<PlannedConfigWrite[]> {
  const existingConfigs = await loadExistingConfigTables(input);

  return buildInstallConfigPlan({
    ...input,
    existingConfigs,
  });
}

export function buildInstallConfigPlan(
  input: BuildInstallConfigPlanInput,
): PlannedConfigWrite[] {
  if (input.finalScope === "user") {
    return [
      createConfigWrite(
        "user",
        input.paths.userConfigPath,
        mergeTomlTables(
          input.existingConfigs.userConfig,
          buildUserScopeConfig(
            input.selectedModel,
            input.paths.modelCatalogPath,
            input.paths.codexHome,
            input.tokenCommand,
          ),
        ),
      ),
    ];
  }

  return [
    createConfigWrite(
      "user",
      input.paths.userConfigPath,
      mergeTomlTables(
        input.existingConfigs.userConfig,
        buildLocalScopeUserConfig(
          input.paths.projectRoot,
          input.paths.codexHome,
          input.tokenCommand,
        ),
      ),
    ),
    createConfigWrite(
      "project",
      input.paths.projectConfigPath,
      mergeTomlTables(
        input.existingConfigs.projectConfig ?? {},
        buildLocalScopeProjectConfig(
          input.selectedModel,
          input.paths.modelCatalogPath,
        ),
      ),
    ),
  ];
}

async function loadExistingConfigTables(
  input: Pick<
    PlanInstallConfigWritesInput,
    "finalScope" | "loadTomlConfig" | "paths"
  >,
): Promise<ExistingInstallConfigs> {
  const userConfig = (await input.loadTomlConfig(input.paths.userConfigPath))
    .settings;

  if (input.finalScope !== "local") {
    return {
      userConfig,
    };
  }

  return {
    projectConfig: (await input.loadTomlConfig(input.paths.projectConfigPath))
      .settings,
    userConfig,
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

function buildUserScopeConfig(
  selectedModel: SupportedModel,
  modelCatalogPath: string,
  codexHome: string,
  tokenCommand: TokenCommandConfig,
): TomlTable {
  return mergeConfigFragments(
    buildActivationConfigPatch(selectedModel, modelCatalogPath),
    buildProviderConfigPatch(codexHome, tokenCommand),
  );
}

function buildLocalScopeUserConfig(
  projectRoot: string,
  codexHome: string,
  tokenCommand: TokenCommandConfig,
): TomlTable {
  return mergeConfigFragments(
    buildProviderConfigPatch(codexHome, tokenCommand),
    buildTrustConfigPatch(projectRoot),
  );
}

function buildLocalScopeProjectConfig(
  selectedModel: SupportedModel,
  modelCatalogPath: string,
): TomlTable {
  return buildActivationConfigPatch(selectedModel, modelCatalogPath);
}

function mergeConfigFragments(...patches: readonly TomlTable[]): TomlTable {
  let mergedConfig: TomlTable = {};

  for (const patch of patches) {
    mergedConfig = mergeTomlTables(mergedConfig, patch);
  }

  return mergedConfig;
}

function buildActivationConfigPatch(
  selectedModel: SupportedModel,
  modelCatalogPath: string,
): TomlTable {
  return {
    model: selectedModel.modelId,
    model_catalog_json: modelCatalogPath,
    model_provider: GONKAGATE_PROVIDER_ID,
  };
}

function buildProviderConfigPatch(
  codexHome: string,
  tokenCommand: TokenCommandConfig,
): TomlTable {
  return {
    model_providers: {
      [GONKAGATE_PROVIDER_ID]: buildProviderConfig(codexHome, tokenCommand),
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

  return {
    auth: authConfig,
    base_url: GONKAGATE_BASE_URL,
    name: GONKAGATE_PROVIDER_NAME,
    supports_websockets: false,
    wire_api: "responses",
  };
}
