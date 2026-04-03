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
  type ScopeResolution,
} from "./install-scope.js";
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
import type { LocalProjectConfigExcludeTarget } from "./local-project-config.js";
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
  localProjectConfigExcludeTarget?: LocalProjectConfigExcludeTarget;
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
  const installState = await resolveInstallState(
    request,
    inputDependencies,
    planningDependencies,
  );
  const writePhases = await planInstallManagedWritePhases({
    apiKey: installState.apiKey,
    configLayers: installState.configLayers,
    installPaths: installState.installPaths,
    loadTomlConfig: planningDependencies.loadTomlConfig,
    selectedModel: installState.summary.selectedModel,
    tokenCommand: installState.tokenCommand,
  });

  return {
    state: installState,
    writePhases,
  };
}

async function resolveInstallState(
  request: InstallRequest,
  inputDependencies: InstallInputDependencies,
  planningDependencies: Pick<
    InstallPlanningDependencies,
    "nodeExecutable" | "platform"
  >,
): Promise<PreparedInstallState> {
  const inputs = await resolveInstallInputs(request, inputDependencies);
  const installContext = await resolveInstallContext(
    request.cwd,
    inputs.requestedScope,
    inputDependencies,
  );
  const tokenCommand = createTokenCommandConfig({
    codexHome: installContext.installPaths.codexHome,
    nodeExecutable: planningDependencies.nodeExecutable,
    platform: planningDependencies.platform,
    tokenPath: installContext.installPaths.tokenPath,
  });

  return createPreparedInstallState({
    ...inputs,
    installContext,
    tokenCommand,
  });
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

interface InstallContext {
  installPaths: InstallPaths;
  scopeResolution: ScopeResolution;
}

async function resolveInstallContext(
  cwd: string,
  requestedScope: InstallScope,
  inputDependencies: Pick<
    InstallInputDependencies,
    | "environment"
    | "inspectLocalProjectConfig"
    | "promptForTrackedLocalConfigAction"
  >,
): Promise<InstallContext> {
  const projectRoot = await resolveProjectRoot(cwd);
  const installPaths = resolveInstallPaths({
    environment: inputDependencies.environment,
    projectRoot,
  });
  const scopeResolution = await resolveInstallScope({
    inspectLocalProjectConfig: inputDependencies.inspectLocalProjectConfig,
    installPaths,
    promptForTrackedLocalConfigAction:
      inputDependencies.promptForTrackedLocalConfigAction,
    requestedScope,
  });

  return {
    installPaths,
    scopeResolution,
  };
}

function createPreparedInstallState(input: {
  apiKey: string;
  codex: CodexAvailability;
  installContext: InstallContext;
  requestedScope: InstallScope;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}): PreparedInstallState {
  return {
    apiKey: input.apiKey,
    configLayers: input.installContext.scopeResolution.configLayers,
    installPaths: input.installContext.installPaths,
    localProjectConfigExcludeTarget:
      input.installContext.scopeResolution.localProjectConfigExcludeTarget,
    summary: buildInstallSummary({
      codex: input.codex,
      installPaths: input.installContext.installPaths,
      requestedScope: input.requestedScope,
      scopeDetails: input.installContext.scopeResolution.details,
      selectedModel: input.selectedModel,
      tokenCommand: input.tokenCommand,
    }),
    tokenCommand: input.tokenCommand,
  };
}

function buildInstallSummary(input: {
  codex: CodexAvailability;
  installPaths: InstallPaths;
  requestedScope: InstallScope;
  scopeDetails: ScopeDetails;
  selectedModel: SupportedModel;
  tokenCommand: TokenCommandConfig;
}): InstallSummary {
  return {
    ...input.scopeDetails,
    codex: input.codex,
    helperPath: input.tokenCommand.helperFilePath,
    modelCatalogPath: input.installPaths.modelCatalogPath,
    projectRoot: input.installPaths.projectRoot,
    requestedScope: input.requestedScope,
    selectedModel: input.selectedModel,
    tokenPath: input.installPaths.tokenPath,
    userConfigPath: input.installPaths.userConfigPath,
  };
}
