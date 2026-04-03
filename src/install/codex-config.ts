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

export type ConfigPatchPaths = Pick<
  InstallPaths,
  "codexHome" | "modelCatalogPath" | "projectRoot"
>;

type ConfigFilePaths = Pick<
  InstallPaths,
  "projectConfigPath" | "userConfigPath"
>;

type InstallConfigPaths = ConfigPatchPaths & ConfigFilePaths;

export interface PlannedConfigWrite {
  config: TomlTable;
  filePath: string;
  target: ConfigTarget;
}

export interface BuildInstallConfigPlanInput {
  existingConfigs: {
    projectConfig?: TomlTable;
    userConfig: TomlTable;
  };
  finalScope: InstallScope;
  paths: InstallConfigPaths;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

export interface PlanInstallConfigWritesInput {
  finalScope: InstallScope;
  loadTomlConfig: (filePath: string) => Promise<LoadedTomlConfig>;
  paths: InstallConfigPaths;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

export async function planInstallConfigWrites(
  input: PlanInstallConfigWritesInput,
): Promise<PlannedConfigWrite[]> {
  const existingConfigs = await loadExistingConfigsForScope(
    input.finalScope,
    input.paths,
    input.loadTomlConfig,
  );

  return buildInstallConfigPlan({
    existingConfigs,
    finalScope: input.finalScope,
    paths: input.paths,
    selectedModel: input.selectedModel,
    tokenCommand: input.tokenCommand,
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
          buildUserScopeConfigPatch(input),
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
        buildLocalScopeUserConfigPatch(input),
      ),
    ),
    createConfigWrite(
      "project",
      input.paths.projectConfigPath,
      mergeTomlTables(
        input.existingConfigs.projectConfig ?? {},
        buildLocalScopeProjectConfigPatch(input),
      ),
    ),
  ];
}

async function loadExistingConfigsForScope(
  finalScope: InstallScope,
  paths: InstallConfigPaths,
  loadTomlConfig: (filePath: string) => Promise<LoadedTomlConfig>,
): Promise<BuildInstallConfigPlanInput["existingConfigs"]> {
  const userConfig = (await loadTomlConfig(paths.userConfigPath)).settings;

  if (finalScope !== "local") {
    return {
      userConfig,
    };
  }

  return {
    projectConfig: (await loadTomlConfig(paths.projectConfigPath)).settings,
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

function buildUserScopeConfigPatch(
  input: Pick<
    BuildInstallConfigPlanInput,
    "paths" | "selectedModel" | "tokenCommand"
  >,
): TomlTable {
  return mergeConfigPatches(
    buildActivationConfigPatch(input.selectedModel, input.paths),
    buildProviderConfigPatch(input.paths, input.tokenCommand),
  );
}

function buildLocalScopeUserConfigPatch(
  input: Pick<
    BuildInstallConfigPlanInput,
    "paths" | "selectedModel" | "tokenCommand"
  >,
): TomlTable {
  return mergeConfigPatches(
    buildProviderConfigPatch(input.paths, input.tokenCommand),
    buildTrustConfigPatch(input.paths.projectRoot),
  );
}

function buildLocalScopeProjectConfigPatch(
  input: Pick<BuildInstallConfigPlanInput, "paths" | "selectedModel">,
): TomlTable {
  return buildActivationConfigPatch(input.selectedModel, input.paths);
}

function mergeConfigPatches(...patches: readonly TomlTable[]): TomlTable {
  let mergedPatch: TomlTable = {};

  for (const patch of patches) {
    mergedPatch = mergeTomlTables(mergedPatch, patch);
  }

  return mergedPatch;
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
