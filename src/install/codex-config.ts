import {
  GONKAGATE_BASE_URL,
  GONKAGATE_PROVIDER_ID,
  GONKAGATE_PROVIDER_NAME,
  TOKEN_COMMAND_TIMEOUT_MS,
  TOKEN_REFRESH_INTERVAL_MS,
} from "../constants/gateway.js";
import type { SupportedModel } from "../constants/models.js";
import type { InstallPaths } from "./settings-paths.js";
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

interface UserInstallConfigs {
  userConfig: TomlTable;
}

interface LocalInstallConfigs extends UserInstallConfigs {
  projectConfig: TomlTable;
}

type ManagedProviderId = typeof GONKAGATE_PROVIDER_ID;

interface ActivationConfigPatch {
  model: SupportedModel["modelId"];
  model_catalog_json: string;
  model_provider: ManagedProviderId;
}

interface TokenAuthConfigBase {
  command: string;
  cwd: string;
  refresh_interval_ms: number;
  timeout_ms: number;
}

interface TokenAuthConfigWithArgs extends TokenAuthConfigBase {
  args: string[];
}

type TokenAuthConfig = TokenAuthConfigBase | TokenAuthConfigWithArgs;

interface ProviderConfig {
  auth: TokenAuthConfig;
  base_url: typeof GONKAGATE_BASE_URL;
  name: typeof GONKAGATE_PROVIDER_NAME;
  supports_websockets: false;
  wire_api: "responses";
}

interface ProviderConfigPatch {
  model_providers: Record<ManagedProviderId, ProviderConfig>;
}

interface TrustedProjectConfig {
  trust_level: "trusted";
}

interface TrustConfigPatch {
  projects: Record<string, TrustedProjectConfig>;
}

type ManagedConfigPatch =
  | ActivationConfigPatch
  | ProviderConfigPatch
  | TrustConfigPatch;

export interface PlannedConfigWrite {
  config: TomlTable;
  filePath: string;
  target: ConfigTarget;
}

interface BuildUserInstallConfigPlanInput extends CommonInstallConfigPlanInput {
  existingConfigs: UserInstallConfigs;
  finalScope: "user";
}

interface BuildLocalInstallConfigPlanInput extends CommonInstallConfigPlanInput {
  existingConfigs: LocalInstallConfigs;
  finalScope: "local";
}

export type BuildInstallConfigPlanInput =
  | BuildUserInstallConfigPlanInput
  | BuildLocalInstallConfigPlanInput;

interface CommonPlanInstallConfigWritesInput extends CommonInstallConfigPlanInput {
  loadTomlConfig: (filePath: string) => Promise<LoadedTomlConfig>;
}

interface PlanUserInstallConfigWritesInput extends CommonPlanInstallConfigWritesInput {
  finalScope: "user";
}

interface PlanLocalInstallConfigWritesInput extends CommonPlanInstallConfigWritesInput {
  finalScope: "local";
}

export type PlanInstallConfigWritesInput =
  | PlanUserInstallConfigWritesInput
  | PlanLocalInstallConfigWritesInput;

export async function planInstallConfigWrites(
  input: PlanInstallConfigWritesInput,
): Promise<PlannedConfigWrite[]> {
  if (input.finalScope === "user") {
    const existingConfigs = await loadUserInstallConfigs(input);

    return buildInstallConfigPlan({
      ...input,
      existingConfigs,
    });
  }

  const existingConfigs = await loadLocalInstallConfigs(input);

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
        input.existingConfigs.projectConfig,
        buildLocalScopeProjectConfig(
          input.selectedModel,
          input.paths.modelCatalogPath,
        ),
      ),
    ),
  ];
}

async function loadUserInstallConfigs(
  input: PlanUserInstallConfigWritesInput,
): Promise<UserInstallConfigs> {
  const userConfig = (await input.loadTomlConfig(input.paths.userConfigPath))
    .settings;

  return {
    userConfig,
  };
}

async function loadLocalInstallConfigs(
  input: PlanLocalInstallConfigWritesInput,
): Promise<LocalInstallConfigs> {
  const userConfig = (await input.loadTomlConfig(input.paths.userConfigPath))
    .settings;

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
  return toTomlTable(
    buildActivationConfigPatch(selectedModel, modelCatalogPath),
  );
}

function mergeConfigFragments(
  ...patches: readonly ManagedConfigPatch[]
): TomlTable {
  let mergedConfig: TomlTable = {};

  for (const patch of patches) {
    mergedConfig = mergeTomlTables(mergedConfig, toTomlTable(patch));
  }

  return mergedConfig;
}

function toTomlTable(patch: ManagedConfigPatch): TomlTable {
  if ("model" in patch) {
    return {
      model: patch.model,
      model_catalog_json: patch.model_catalog_json,
      model_provider: patch.model_provider,
    };
  }

  if ("model_providers" in patch) {
    const modelProviders: TomlTable = {};
    modelProviders[GONKAGATE_PROVIDER_ID] = toProviderConfigTable(
      patch.model_providers[GONKAGATE_PROVIDER_ID],
    );

    return {
      model_providers: modelProviders,
    };
  }

  const projects: TomlTable = {};

  for (const [projectRoot, projectConfig] of Object.entries(patch.projects)) {
    projects[projectRoot] = toTrustedProjectConfigTable(projectConfig);
  }

  return {
    projects,
  };
}

function toProviderConfigTable(providerConfig: ProviderConfig): TomlTable {
  return {
    auth: toTokenAuthConfigTable(providerConfig.auth),
    base_url: providerConfig.base_url,
    name: providerConfig.name,
    supports_websockets: providerConfig.supports_websockets,
    wire_api: providerConfig.wire_api,
  };
}

function toTokenAuthConfigTable(authConfig: TokenAuthConfig): TomlTable {
  if ("args" in authConfig) {
    return {
      args: [...authConfig.args],
      command: authConfig.command,
      cwd: authConfig.cwd,
      refresh_interval_ms: authConfig.refresh_interval_ms,
      timeout_ms: authConfig.timeout_ms,
    };
  }

  return {
    command: authConfig.command,
    cwd: authConfig.cwd,
    refresh_interval_ms: authConfig.refresh_interval_ms,
    timeout_ms: authConfig.timeout_ms,
  };
}

function toTrustedProjectConfigTable(
  projectConfig: TrustedProjectConfig,
): TomlTable {
  return {
    trust_level: projectConfig.trust_level,
  };
}

function buildActivationConfigPatch(
  selectedModel: SupportedModel,
  modelCatalogPath: string,
): ActivationConfigPatch {
  return {
    model: selectedModel.modelId,
    model_catalog_json: modelCatalogPath,
    model_provider: GONKAGATE_PROVIDER_ID,
  } satisfies ActivationConfigPatch;
}

function buildProviderConfigPatch(
  codexHome: string,
  tokenCommand: TokenCommandConfig,
): ProviderConfigPatch {
  return {
    model_providers: {
      [GONKAGATE_PROVIDER_ID]: buildProviderConfig(codexHome, tokenCommand),
    },
  } satisfies ProviderConfigPatch;
}

function buildTrustConfigPatch(projectRoot: string): TrustConfigPatch {
  return {
    projects: {
      [projectRoot]: {
        trust_level: "trusted",
      },
    },
  } satisfies TrustConfigPatch;
}

function buildProviderConfig(
  codexHome: string,
  tokenCommand: TokenCommandConfig,
): ProviderConfig {
  const authConfigBase = {
    command: tokenCommand.command,
    cwd: codexHome,
    refresh_interval_ms: TOKEN_REFRESH_INTERVAL_MS,
    timeout_ms: TOKEN_COMMAND_TIMEOUT_MS,
  } satisfies TokenAuthConfigBase;

  const authConfig: TokenAuthConfig =
    tokenCommand.args.length > 0
      ? ({
          ...authConfigBase,
          args: [...tokenCommand.args],
        } satisfies TokenAuthConfigWithArgs)
      : authConfigBase;

  return {
    auth: authConfig,
    base_url: GONKAGATE_BASE_URL,
    name: GONKAGATE_PROVIDER_NAME,
    supports_websockets: false,
    wire_api: "responses",
  } satisfies ProviderConfig;
}
