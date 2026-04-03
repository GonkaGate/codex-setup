import {
  DEFAULT_MODEL_KEY,
  SUPPORTED_MODELS,
  requireSupportedModel,
  type SupportedModel,
} from "../constants/models.js";
import type { CodexAvailability } from "./codex-command.js";
import {
  planInstallManagedWritePhases,
  type InstallWritePhase,
} from "./install-managed-writes.js";
import { resolveInstallScope, type ScopeDetails } from "./install-scope.js";
import type { LocalProjectConfigExcludeTarget } from "./local-project-config.js";
import {
  resolveInstallPaths,
  resolveProjectRoot,
  type InstallPaths,
  type InstallScope,
} from "./settings-paths.js";
import {
  createTokenCommandConfig,
  type TokenCommandConfig,
} from "./token-helper.js";
import type {
  InstallInputDependencies,
  InstallPlanningDependencies,
} from "./install-dependencies.js";
import type { InstallRequest } from "./install-use-case.js";

export interface InstallSummary extends ScopeDetails {
  codex: CodexAvailability;
  helperPath: string;
  modelCatalogPath: string;
  projectRoot: string;
  requestedScope: InstallScope;
  selectedModel: SupportedModel;
  tokenPath: string;
  userConfigPath: string;
}

export interface PreparedInstallContext extends ScopeDetails {
  apiKey: string;
  codex: CodexAvailability;
  installPaths: InstallPaths;
  localProjectConfigExcludeTarget?: LocalProjectConfigExcludeTarget;
  requestedScope: InstallScope;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

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
  const installPaths = await resolveInstallPathsForRequest(
    request,
    inputDependencies.environment,
  );
  const scopeResolution = await resolveRequestedInstallScope(
    installPaths,
    resolvedInputs.requestedScope,
    inputDependencies,
  );
  const tokenCommand = createTokenCommandConfig({
    codexHome: installPaths.codexHome,
    nodeExecutable: planningDependencies.nodeExecutable,
    platform: planningDependencies.platform,
    tokenPath: installPaths.tokenPath,
  });

  return createPreparedInstallContext(
    resolvedInputs,
    installPaths,
    scopeResolution,
    tokenCommand,
  );
}

async function resolveInstallPathsForRequest(
  request: InstallRequest,
  environment: NodeJS.ProcessEnv,
): Promise<InstallPaths> {
  const projectRoot = await resolveProjectRoot(request.cwd);

  return resolveInstallPaths({
    environment,
    projectRoot,
  });
}

async function resolveRequestedInstallScope(
  installPaths: InstallPaths,
  requestedScope: InstallScope,
  inputDependencies: InstallInputDependencies,
) {
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
  scopeResolution: Awaited<ReturnType<typeof resolveInstallScope>>,
  tokenCommand: TokenCommandConfig,
): PreparedInstallContext {
  return {
    ...scopeResolution.details,
    apiKey: resolvedInputs.apiKey,
    codex: resolvedInputs.codex,
    installPaths,
    localProjectConfigExcludeTarget:
      scopeResolution.localProjectConfigExcludeTarget,
    requestedScope: resolvedInputs.requestedScope,
    selectedModel: resolvedInputs.selectedModel,
    tokenCommand,
  };
}

async function planPreparedInstallWritePhases(
  context: PreparedInstallContext,
  loadTomlConfig: InstallPlanningDependencies["loadTomlConfig"],
): Promise<InstallWritePhase[]> {
  return planInstallManagedWritePhases({
    apiKey: context.apiKey,
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
  const selectedModel = request.modelKey
    ? requireSupportedModel(request.modelKey)
    : await inputDependencies.promptForModel(
        SUPPORTED_MODELS,
        DEFAULT_MODEL_KEY,
      );
  const requestedScope =
    request.scope ?? (await inputDependencies.promptForScope("user"));

  return {
    apiKey,
    codex,
    requestedScope,
    selectedModel,
  };
}
export function createInstallSummary(
  context: PreparedInstallContext,
): InstallSummary {
  return {
    codex: context.codex,
    finalScope: context.finalScope,
    helperPath: context.tokenCommand.helperFilePath,
    modelCatalogPath: context.installPaths.modelCatalogPath,
    projectConfigPath: context.projectConfigPath,
    projectRoot: context.installPaths.projectRoot,
    requestedScope: context.requestedScope,
    selectedModel: context.selectedModel,
    switchedToUserScope: context.switchedToUserScope,
    tokenPath: context.installPaths.tokenPath,
    trustTargetPath: context.trustTargetPath,
    userConfigPath: context.installPaths.userConfigPath,
  };
}
