import {
  DEFAULT_MODEL_KEY,
  SUPPORTED_MODELS,
  requireSupportedModel,
  type SupportedModel,
} from "../constants/models.js";
import type { CodexAvailability } from "./codex-command.js";
import {
  planInstallManagedWritePhases,
  type PlannedManagedWritePhase,
} from "./install-managed-writes.js";
import {
  resolveInstallScope,
  type ScopeConfigLayer,
  type ScopeDetails,
} from "./install-scope.js";
import type { LocalProjectConfigIgnoreTarget } from "./local-project-config.js";
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

export interface PreparedInstallContext {
  apiKey: string;
  codex: CodexAvailability;
  configLayers: readonly ScopeConfigLayer[];
  installPaths: InstallPaths;
  localProjectConfigIgnoreTarget?: LocalProjectConfigIgnoreTarget;
  requestedScope: InstallScope;
  scopeDetails: ScopeDetails;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}

export interface PreparedInstallPlan {
  context: PreparedInstallContext;
  writePhases: PlannedManagedWritePhase[];
}

export async function prepareInstallPlan(
  request: InstallRequest,
  inputDependencies: InstallInputDependencies,
  planningDependencies: InstallPlanningDependencies,
): Promise<PreparedInstallPlan> {
  const installInputs = await resolveInstallInputs(request, inputDependencies);
  const projectRoot = await resolveProjectRoot(request.cwd);
  const installPaths = resolveInstallPaths({
    environment: inputDependencies.environment,
    projectRoot,
  });
  const resolvedScope = await resolveInstallScope({
    inspectLocalProjectConfig: inputDependencies.inspectLocalProjectConfig,
    installPaths,
    promptForTrackedLocalConfigAction:
      inputDependencies.promptForTrackedLocalConfigAction,
    requestedScope: installInputs.requestedScope,
  });
  const tokenCommand = createTokenCommandConfig({
    codexHome: installPaths.codexHome,
    nodeExecutable: planningDependencies.nodeExecutable,
    platform: planningDependencies.platform,
    tokenPath: installPaths.tokenPath,
  });
  const context: PreparedInstallContext = {
    apiKey: installInputs.apiKey,
    codex: installInputs.codex,
    configLayers: resolvedScope.configLayers,
    installPaths,
    localProjectConfigIgnoreTarget:
      resolvedScope.localProjectConfigIgnoreTarget,
    requestedScope: installInputs.requestedScope,
    scopeDetails: resolvedScope.details,
    selectedModel: installInputs.selectedModel,
    tokenCommand,
  };
  const writePhases = await planInstallManagedWritePhases({
    apiKey: context.apiKey,
    configLayers: context.configLayers,
    installPaths: context.installPaths,
    loadTomlConfig: planningDependencies.loadTomlConfig,
    selectedModel: context.selectedModel,
    tokenCommand: context.tokenCommand,
  });

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

async function resolveInstallInputs(
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

export function summarizePreparedInstallContext(
  context: PreparedInstallContext,
): InstallSummary {
  return {
    ...context.scopeDetails,
    codex: context.codex,
    helperPath: context.tokenCommand.helperFilePath,
    modelCatalogPath: context.installPaths.modelCatalogPath,
    projectRoot: context.installPaths.projectRoot,
    requestedScope: context.requestedScope,
    selectedModel: context.selectedModel,
    tokenPath: context.installPaths.tokenPath,
    userConfigPath: context.installPaths.userConfigPath,
  };
}
