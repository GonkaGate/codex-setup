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
import { isMissingFileError } from "./error-codes.js";
import type { InstallScope } from "./settings-paths.js";
import type { TokenCommandConfig } from "./token-helper.js";

export type TomlTable = Parameters<typeof TOML.stringify>[0];
export type TomlValue = TomlTable[string];

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

export interface ManagedTomlConfigWrite {
  content: string;
  contentComparator: (currentText: string, nextText: string) => boolean;
}

export interface BuildInstallConfigPlanInput {
  currentConfigs: Partial<Record<ConfigLayerTarget, TomlTable>>;
  finalScope: InstallScope;
  paths: ConfigPathsInput;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

export interface PlanInstallConfigWritesInput {
  finalScope: InstallScope;
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

interface ConfigLayerDefinition {
  patchBuilders: readonly ConfigPatchBuilder[];
  resolveFilePath: (paths: ConfigLayerPaths) => string;
  target: ConfigLayerTarget;
}

const CONFIG_LAYER_DEFINITIONS: Record<
  InstallScope,
  readonly ConfigLayerDefinition[]
> = {
  local: [
    createConfigLayerDefinition("user", (paths) => paths.userConfigPath, [
      buildProviderLayerPatch,
      buildLocalTrustLayerPatch,
    ]),
    createConfigLayerDefinition("project", (paths) => paths.projectConfigPath, [
      buildActivationLayerPatch,
    ]),
  ],
  user: [
    createConfigLayerDefinition("user", (paths) => paths.userConfigPath, [
      buildActivationLayerPatch,
      buildProviderLayerPatch,
    ]),
  ],
};

export async function loadTomlConfig(
  filePath: string,
): Promise<LoadedTomlConfig> {
  try {
    const text = await readFile(filePath, "utf8");
    const settings: TomlTable = TOML.parse(text);

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

export async function planInstallConfigWrites(
  input: PlanInstallConfigWritesInput,
): Promise<ConfigFilePlanEntry[]> {
  const layerDefinitions = getConfigLayerDefinitions(input.finalScope);
  const context = createConfigPlanBuildContext(input);
  const plannedEntries: ConfigFilePlanEntry[] = [];

  for (const definition of layerDefinitions) {
    const filePath = definition.resolveFilePath(input.paths);
    const currentConfig = (await input.loadTomlConfig(filePath)).settings;
    const entry = buildConfigPlanEntry(definition, currentConfig, context);

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

  return getConfigLayerDefinitions(input.finalScope).map((definition) =>
    buildConfigPlanEntry(
      definition,
      input.currentConfigs[definition.target] ?? {},
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
  definition: ConfigLayerDefinition,
  currentConfig: TomlTable,
  context: ConfigPlanBuildContext,
): ConfigLayerPlanEntry {
  return {
    config: mergeTomlTables(
      currentConfig,
      mergeTomlPatches(
        ...definition.patchBuilders.map((buildPatch) => buildPatch(context)),
      ),
    ),
    target: definition.target,
  };
}

export function renderTomlConfig(config: TomlTable): string {
  const rendered = TOML.stringify(config);
  return rendered.endsWith("\n") ? rendered : `${rendered}\n`;
}

export function createManagedTomlConfigWrite(
  config: TomlTable,
): ManagedTomlConfigWrite {
  return {
    content: renderTomlConfig(config),
    contentComparator: areEquivalentTomlTexts,
  };
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

function createConfigLayerDefinition(
  target: ConfigLayerTarget,
  resolveFilePath: (paths: ConfigLayerPaths) => string,
  patchBuilders: readonly ConfigPatchBuilder[],
): ConfigLayerDefinition {
  return {
    patchBuilders,
    resolveFilePath,
    target,
  };
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

function cloneTomlValue<Value extends TomlValue>(value: Value): Value {
  if (Array.isArray(value)) {
    return value.map((item) => cloneTomlValue(item)) as Value;
  }

  if (isPlainTomlTable(value)) {
    return mergeTomlTables({}, value) as Value;
  }

  return value;
}

function isPlainTomlTable(value: unknown): value is TomlTable {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    value instanceof Date
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function getConfigLayerDefinitions(
  finalScope: InstallScope,
): readonly ConfigLayerDefinition[] {
  return CONFIG_LAYER_DEFINITIONS[finalScope];
}

export function areEquivalentTomlTexts(
  currentText: string,
  nextText: string,
): boolean {
  return normalizeTomlText(currentText) === normalizeTomlText(nextText);
}

function normalizeTomlText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}
