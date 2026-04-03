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
import { resolveInstallScope, type ScopeDetails } from "./install-scope.js";
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
    configLayers: installState.summary.configLayers,
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
    requestedScope,
  });
  const tokenCommand = createTokenCommandConfig({
    codexHome: installPaths.codexHome,
    nodeExecutable: planningDependencies.nodeExecutable,
    platform: planningDependencies.platform,
    tokenPath: installPaths.tokenPath,
  });

  return {
    apiKey,
    installPaths,
    localProjectConfigExcludeTarget:
      scopeResolution.localProjectConfigExcludeTarget,
    summary: buildInstallSummary({
      codex,
      installPaths,
      requestedScope,
      scopeDetails: scopeResolution.details,
      selectedModel,
      tokenCommand,
    }),
    tokenCommand,
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
