import { readFile } from "node:fs/promises";
import TOML from "@iarna/toml";
import {
  GONKAGATE_BASE_URL,
  GONKAGATE_PROVIDER_ID,
  GONKAGATE_PROVIDER_NAME,
  TOKEN_COMMAND_TIMEOUT_MS,
  TOKEN_REFRESH_INTERVAL_MS,
} from "../constants/gateway.js";
import type { SupportedModel } from "../constants/models.js";
import type { InstallScope } from "./settings-paths.js";
import type { TokenCommandConfig } from "./token-helper.js";

export type TomlValue =
  | boolean
  | number
  | string
  | Date
  | TomlTable
  | TomlValue[];

export interface TomlTable {
  [key: string]: TomlValue;
}

export interface LoadedTomlConfig {
  exists: boolean;
  filePath: string;
  settings: TomlTable;
  text: string;
}

export interface ConfigPathsInput {
  codexHome: string;
  modelCatalogPath: string;
  projectRoot: string;
}

export type ConfigLayerTarget = "user" | "project";

export interface ConfigLayerPlanEntry {
  config: TomlTable;
  target: ConfigLayerTarget;
}

export interface BuildInstallConfigPlanInput {
  currentConfigs: Partial<Record<ConfigLayerTarget, TomlTable>>;
  finalScope: InstallScope;
  paths: ConfigPathsInput;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

const USER_SCOPE_CONFIG_TARGETS = ["user"] as const;
const LOCAL_SCOPE_CONFIG_TARGETS = ["user", "project"] as const;

export async function loadTomlConfig(
  filePath: string,
): Promise<LoadedTomlConfig> {
  try {
    const text = await readFile(filePath, "utf8");
    const settings = TOML.parse(text) as TomlTable;

    return {
      exists: true,
      filePath,
      settings,
      text,
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        exists: false,
        filePath,
        settings: {},
        text: "",
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ${filePath} as TOML: ${message}`);
  }
}

export function getConfigTargetsForScope(
  finalScope: InstallScope,
): readonly ConfigLayerTarget[] {
  return finalScope === "local"
    ? LOCAL_SCOPE_CONFIG_TARGETS
    : USER_SCOPE_CONFIG_TARGETS;
}

export function buildInstallConfigPlan(
  input: BuildInstallConfigPlanInput,
): ConfigLayerPlanEntry[] {
  if (input.finalScope === "user") {
    return [
      {
        config: applyUserScopeConfig(
          getCurrentConfig(input.currentConfigs, "user"),
          input.selectedModel,
          input.paths,
          input.tokenCommand,
        ),
        target: "user",
      },
    ];
  }

  return [
    {
      config: applyLocalUserConfig(
        getCurrentConfig(input.currentConfigs, "user"),
        input.paths,
        input.tokenCommand,
      ),
      target: "user",
    },
    {
      config: applyLocalProjectConfig(
        getCurrentConfig(input.currentConfigs, "project"),
        input.selectedModel,
        input.paths,
      ),
      target: "project",
    },
  ];
}

export function applyUserScopeConfig(
  currentConfig: TomlTable,
  selectedModel: SupportedModel,
  paths: ConfigPathsInput,
  tokenCommand: TokenCommandConfig,
): TomlTable {
  return mergeTomlTables(
    currentConfig,
    mergeTomlPatches(
      buildActivationConfigPatch(selectedModel, paths),
      buildProviderConfigPatch(paths, tokenCommand),
    ),
  );
}

export function applyLocalUserConfig(
  currentConfig: TomlTable,
  paths: ConfigPathsInput,
  tokenCommand: TokenCommandConfig,
): TomlTable {
  return mergeTomlTables(
    currentConfig,
    mergeTomlPatches(
      buildProviderConfigPatch(paths, tokenCommand),
      buildLocalTrustConfigPatch(paths.projectRoot),
    ),
  );
}

export function applyLocalProjectConfig(
  currentConfig: TomlTable,
  selectedModel: SupportedModel,
  paths: ConfigPathsInput,
): TomlTable {
  return mergeTomlTables(
    currentConfig,
    buildActivationConfigPatch(selectedModel, paths),
  );
}

export function renderTomlConfig(config: TomlTable): string {
  const rendered = TOML.stringify(
    config as Parameters<typeof TOML.stringify>[0],
  );
  return rendered.endsWith("\n") ? rendered : `${rendered}\n`;
}

export function mergeTomlTables(
  currentConfig: TomlTable,
  patch: TomlTable,
): TomlTable {
  const nextConfig: TomlTable = { ...currentConfig };

  for (const [key, value] of Object.entries(patch)) {
    const existingValue = nextConfig[key];

    if (isPlainTomlTable(existingValue) && isPlainTomlTable(value)) {
      nextConfig[key] = mergeTomlTables(existingValue, value);
      continue;
    }

    nextConfig[key] = cloneTomlValue(value);
  }

  return nextConfig;
}

function mergeTomlPatches(...patches: readonly TomlTable[]): TomlTable {
  let nextPatch: TomlTable = {};

  for (const patch of patches) {
    nextPatch = mergeTomlTables(nextPatch, patch);
  }

  return nextPatch;
}

function buildActivationConfigPatch(
  selectedModel: SupportedModel,
  paths: ConfigPathsInput,
): TomlTable {
  return {
    model_provider: GONKAGATE_PROVIDER_ID,
    model: selectedModel.modelId,
    model_catalog_json: paths.modelCatalogPath,
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

function cloneTomlValue(value: TomlValue): TomlValue {
  if (Array.isArray(value)) {
    return value.map((item) => cloneTomlValue(item));
  }

  if (isPlainTomlTable(value)) {
    return mergeTomlTables({}, value);
  }

  return value;
}

function isPlainTomlTable(value: unknown): value is TomlTable {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getCurrentConfig(
  currentConfigs: Partial<Record<ConfigLayerTarget, TomlTable>>,
  target: ConfigLayerTarget,
): TomlTable {
  return currentConfigs[target] ?? {};
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
