import {
  getDefaultSupportedModel,
  requireSupportedModel,
  type SupportedModel,
} from "../constants/models.js";
import type { CodexAvailability } from "./codex-command.js";
import {
  planInstallManagedWritePhases,
  type InstallWritePhase,
} from "./install-managed-writes.js";
import {
  createLocalScopeDetails,
  createUserScopeDetails,
  resolveInstallScope,
  type LocalScopeDetails,
  type LocalScopeResolution,
  type ScopeResolution,
  type UserScopeResolution,
  type UserScopeDetails,
} from "./install-scope.js";
import { type InstallPaths, type InstallScope } from "./settings-paths.js";
import { type TokenCommandConfig } from "./token-helper.js";
import type {
  InstallInputDependencies,
  InstallPlanningDependencies,
} from "./install-dependencies.js";
import type { InstallRequest } from "./install-use-case.js";
import { resolveInstallArtifacts } from "./install-artifacts.js";

interface InstallSummaryBase {
  codex: CodexAvailability;
  helperPath: string;
  modelCatalogPath: string;
  projectRoot: string;
  requestedScope: InstallScope;
  selectedModel: SupportedModel;
  tokenPath: string;
  userConfigPath: string;
}

export interface UserInstallSummary
  extends InstallSummaryBase, UserScopeDetails {}

export interface LocalInstallSummary
  extends InstallSummaryBase, LocalScopeDetails {}

export type InstallSummary = UserInstallSummary | LocalInstallSummary;

interface PreparedInstallContextBase {
  apiKey: string;
  availableModels: readonly SupportedModel[];
  codex: CodexAvailability;
  installPaths: InstallPaths;
  requestedScope: InstallScope;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

export interface PreparedUserInstallContext
  extends PreparedInstallContextBase, UserScopeResolution {}

export interface PreparedLocalInstallContext
  extends PreparedInstallContextBase, LocalScopeResolution {}

export type PreparedInstallContext =
  | PreparedUserInstallContext
  | PreparedLocalInstallContext;

export interface PreparedInstallPlan {
  context: PreparedInstallContext;
  writePhases: InstallWritePhase[];
}

export async function prepareInstallPlan(
  request: InstallRequest,
  inputDependencies: InstallInputDependencies,
  planningDependencies: InstallPlanningDependencies,
): Promise<PreparedInstallPlan> {
  const context = await resolvePreparedInstallContext(
    request,
    inputDependencies,
    planningDependencies,
  );
  const writePhases = await planPreparedInstallWritePhases(
    context,
    planningDependencies.loadTomlConfig,
  );

  return {
    context,
    writePhases,
  };
}

interface ResolvedInstallInputs {
  apiKey: string;
  availableModels: readonly SupportedModel[];
  codex: CodexAvailability;
  requestedScope: InstallScope;
  selectedModel: SupportedModel;
}

async function resolvePreparedInstallContext(
  request: InstallRequest,
  inputDependencies: InstallInputDependencies,
  planningDependencies: InstallPlanningDependencies,
): Promise<PreparedInstallContext> {
  const resolvedInputs = await collectInstallInputs(request, inputDependencies);
  const { installPaths, tokenCommand } = await resolveInstallArtifacts({
    cwd: request.cwd,
    environment: inputDependencies.environment,
    nodeExecutable: planningDependencies.nodeExecutable,
    platform: planningDependencies.platform,
  });
  const scopeResolution = await resolveRequestedInstallScope(
    installPaths,
    resolvedInputs.requestedScope,
    inputDependencies,
  );

  return createPreparedInstallContext(
    resolvedInputs,
    installPaths,
    scopeResolution,
    tokenCommand,
  );
}

async function resolveRequestedInstallScope(
  installPaths: InstallPaths,
  requestedScope: InstallScope,
  inputDependencies: InstallInputDependencies,
): Promise<ScopeResolution> {
  return resolveInstallScope({
    inspectLocalProjectConfig: inputDependencies.inspectLocalProjectConfig,
    installPaths,
    promptForTrackedLocalConfigAction:
      inputDependencies.promptForTrackedLocalConfigAction,
    requestedScope,
  });
}

function createPreparedInstallContext(
  resolvedInputs: ResolvedInstallInputs,
  installPaths: InstallPaths,
  scopeResolution: ScopeResolution,
  tokenCommand: TokenCommandConfig,
): PreparedInstallContext {
  return {
    apiKey: resolvedInputs.apiKey,
    availableModels: resolvedInputs.availableModels,
    codex: resolvedInputs.codex,
    installPaths,
    requestedScope: resolvedInputs.requestedScope,
    selectedModel: resolvedInputs.selectedModel,
    tokenCommand,
    ...scopeResolution,
  };
}

async function planPreparedInstallWritePhases(
  context: PreparedInstallContext,
  loadTomlConfig: InstallPlanningDependencies["loadTomlConfig"],
): Promise<InstallWritePhase[]> {
  return planInstallManagedWritePhases({
    apiKey: context.apiKey,
    availableModels: context.availableModels,
    finalScope: context.finalScope,
    installPaths: context.installPaths,
    loadTomlConfig,
    selectedModel: context.selectedModel,
    tokenCommand: context.tokenCommand,
  });
}

async function collectInstallInputs(
  request: InstallRequest,
  inputDependencies: InstallInputDependencies,
): Promise<ResolvedInstallInputs> {
  const codex = inputDependencies.checkCodexAvailable();
  const apiKey = inputDependencies.validateApiKey(
    await inputDependencies.promptForApiKey(),
  );
  const availableModels = await inputDependencies.fetchGonkagateModels(apiKey);
  const defaultModel = getDefaultSupportedModel(availableModels);
  const selectedModel = request.modelKey
    ? requireSupportedModel(availableModels, request.modelKey)
    : await inputDependencies.promptForModel(availableModels, defaultModel.key);
  const requestedScope =
    request.scope ?? (await inputDependencies.promptForScope("user"));

  return {
    apiKey,
    availableModels,
    codex,
    requestedScope,
    selectedModel,
  };
}
export function createInstallSummary(
  context: PreparedInstallContext,
): InstallSummary {
  const commonSummary = {
    codex: context.codex,
    helperPath: context.tokenCommand.helperFilePath,
    modelCatalogPath: context.installPaths.modelCatalogPath,
    projectRoot: context.installPaths.projectRoot,
    requestedScope: context.requestedScope,
    selectedModel: context.selectedModel,
    tokenPath: context.installPaths.tokenPath,
    userConfigPath: context.installPaths.userConfigPath,
  };

  if (context.finalScope === "user") {
    return {
      ...commonSummary,
      ...createUserScopeDetails(context.switchedToUserScope),
    };
  }

  return {
    ...commonSummary,
    ...createLocalScopeDetails({
      projectConfigPath: context.projectConfigPath,
      projectRoot: context.trustTargetPath,
    }),
  };
}
