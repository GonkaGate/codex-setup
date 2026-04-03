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
  InstallRequest,
} from "./install-use-case.js";

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

export interface PreparedInstallState {
  apiKey: string;
  configLayers: readonly ScopeConfigLayer[];
  installPaths: InstallPaths;
  localProjectConfigIgnoreTarget?: LocalProjectConfigIgnoreTarget;
  summary: InstallSummary;
  tokenCommand: TokenCommandConfig;
}

export interface PreparedInstallPlan {
  state: PreparedInstallState;
  writePhases: PlannedManagedWritePhase[];
}

export async function prepareInstallPlan(
  request: InstallRequest,
  inputDependencies: InstallInputDependencies,
  planningDependencies: InstallPlanningDependencies,
): Promise<PreparedInstallPlan> {
  const collectedInputs = await collectInstallInputs(
    request,
    inputDependencies,
  );
  const projectRoot = await resolveProjectRoot(request.cwd);
  const installPaths = resolveInstallPaths({
    environment: inputDependencies.environment,
    projectRoot,
  });
  const scopeResolution = await resolveInstallScope({
    inspectLocalProjectConfig: inputDependencies.inspectLocalProjectConfig,
    installPaths,
    promptForTrackedLocalConfigAction:
      inputDependencies.promptForTrackedLocalConfigAction,
    requestedScope: collectedInputs.requestedScope,
  });
  const tokenCommand = createTokenCommandConfig({
    codexHome: installPaths.codexHome,
    nodeExecutable: planningDependencies.nodeExecutable,
    platform: planningDependencies.platform,
    tokenPath: installPaths.tokenPath,
  });
  const state: PreparedInstallState = {
    apiKey: collectedInputs.apiKey,
    configLayers: scopeResolution.configLayers,
    installPaths,
    localProjectConfigIgnoreTarget:
      scopeResolution.localProjectConfigIgnoreTarget,
    summary: buildInstallSummary({
      codex: collectedInputs.codex,
      helperPath: tokenCommand.helperFilePath,
      installPaths,
      requestedScope: collectedInputs.requestedScope,
      scopeDetails: scopeResolution.details,
      selectedModel: collectedInputs.selectedModel,
    }),
    tokenCommand,
  };
  const writePhases = await planInstallManagedWritePhases({
    apiKey: state.apiKey,
    configLayers: state.configLayers,
    installPaths: state.installPaths,
    loadTomlConfig: planningDependencies.loadTomlConfig,
    selectedModel: state.summary.selectedModel,
    tokenCommand: state.tokenCommand,
  });

  return {
    state,
    writePhases,
  };
}

interface CollectedInstallInputs {
  apiKey: string;
  codex: CodexAvailability;
  requestedScope: InstallScope;
  selectedModel: SupportedModel;
}

async function collectInstallInputs(
  request: InstallRequest,
  inputDependencies: InstallInputDependencies,
): Promise<CollectedInstallInputs> {
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

function buildInstallSummary(input: {
  codex: CodexAvailability;
  helperPath: string;
  installPaths: InstallPaths;
  requestedScope: InstallScope;
  scopeDetails: ScopeDetails;
  selectedModel: SupportedModel;
}): InstallSummary {
  return {
    ...input.scopeDetails,
    codex: input.codex,
    helperPath: input.helperPath,
    modelCatalogPath: input.installPaths.modelCatalogPath,
    projectRoot: input.installPaths.projectRoot,
    requestedScope: input.requestedScope,
    selectedModel: input.selectedModel,
    tokenPath: input.installPaths.tokenPath,
    userConfigPath: input.installPaths.userConfigPath,
  };
}
