import {
  DEFAULT_MODEL_KEY,
  SUPPORTED_MODELS,
  requireSupportedModel,
  type SupportedModel,
  type SupportedModelKey,
} from "../constants/models.js";
import { createBackup } from "./backup.js";
import {
  checkCodexAvailable,
  type CodexAvailability,
} from "./codex-command.js";
import { loadTomlConfig } from "./codex-config.js";
import {
  InstallCommitError,
  type InstallRollbackFailure,
} from "./install-errors.js";
import {
  inspectLocalProjectConfig,
  type LocalProjectConfigExcludeTarget,
} from "./local-project-config.js";
import { ensureLocalProjectConfigExcluded } from "./local-git-ignore.js";
import {
  planInstallManagedWritePhases,
  type PlannedManagedWritePhase,
} from "./install-managed-writes.js";
import { resolveInstallScope, type ScopeDetails } from "./install-scope.js";
import {
  promptForApiKey,
  promptForModel,
  promptForScope,
  promptForTrackedLocalConfigAction,
} from "./prompts.js";
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
import { validateApiKey } from "./validate-api-key.js";
import {
  rollbackManagedTextFile,
  writeManagedTextFile,
  type ManagedWriteResult,
} from "./write-managed-file.js";

export interface InstallRequest {
  cwd: string;
  modelKey?: SupportedModelKey;
  scope?: InstallScope;
}

interface InstallDetails {
  codex: CodexAvailability;
  finalScope: InstallScope;
  helperPath: string;
  modelCatalogPath: string;
  projectConfigPath?: string;
  projectRoot: string;
  requestedScope: InstallScope;
  selectedModel: SupportedModel;
  switchedToUserScope: boolean;
  tokenPath: string;
  trustTargetPath?: string;
  userConfigPath: string;
}

export interface InstallOutcome extends InstallDetails {
  writes: ManagedWriteResult[];
}

export interface InstallInputDependencies {
  checkCodexAvailable: typeof checkCodexAvailable;
  environment: NodeJS.ProcessEnv;
  inspectLocalProjectConfig: typeof inspectLocalProjectConfig;
  promptForApiKey: typeof promptForApiKey;
  promptForModel: typeof promptForModel;
  promptForScope: typeof promptForScope;
  promptForTrackedLocalConfigAction: typeof promptForTrackedLocalConfigAction;
  validateApiKey: typeof validateApiKey;
}

export interface InstallPlanningDependencies {
  loadTomlConfig: typeof loadTomlConfig;
  nodeExecutable: string;
  platform: NodeJS.Platform;
}

export interface InstallCommitDependencies {
  createBackup: typeof createBackup;
  ensureLocalProjectConfigExcluded: typeof ensureLocalProjectConfigExcluded;
  rollbackManagedTextFile: typeof rollbackManagedTextFile;
  writeManagedTextFile: typeof writeManagedTextFile;
}

export interface InstallUseCaseDependencies {
  commit: InstallCommitDependencies;
  input: InstallInputDependencies;
  planning: InstallPlanningDependencies;
}

export interface InstallUseCaseDependencyOverrides {
  commit?: Partial<InstallCommitDependencies>;
  input?: Partial<InstallInputDependencies>;
  planning?: Partial<InstallPlanningDependencies>;
}

interface ResolvedInstallContext {
  apiKey: string;
  codex: CodexAvailability;
  installPaths: InstallPaths;
  localProjectConfigExcludeTarget?: LocalProjectConfigExcludeTarget;
  requestedScope: InstallScope;
  selectedModel: SupportedModel;
  scopeDetails: ScopeDetails;
}

interface PreparedInstallPlan {
  details: InstallDetails;
  localProjectConfigExcludeTarget?: LocalProjectConfigExcludeTarget;
  writePhases: PlannedManagedWritePhase[];
}

const baseInstallInputDependencies = {
  checkCodexAvailable,
  environment: process.env,
  inspectLocalProjectConfig,
  promptForApiKey,
  promptForModel,
  promptForScope,
  promptForTrackedLocalConfigAction,
  validateApiKey,
} satisfies InstallInputDependencies;

const baseInstallPlanningDependencies = {
  loadTomlConfig,
  nodeExecutable: process.execPath,
  platform: process.platform,
} satisfies InstallPlanningDependencies;

const baseInstallCommitDependencies = {
  createBackup,
  ensureLocalProjectConfigExcluded,
  rollbackManagedTextFile,
  writeManagedTextFile,
} satisfies InstallCommitDependencies;

export function createInstallUseCaseDependencies(
  overrides: InstallUseCaseDependencyOverrides = {},
): InstallUseCaseDependencies {
  return {
    commit: {
      ...baseInstallCommitDependencies,
      ...overrides.commit,
    },
    input: {
      ...baseInstallInputDependencies,
      ...overrides.input,
    },
    planning: {
      ...baseInstallPlanningDependencies,
      ...overrides.planning,
    },
  };
}

export const defaultInstallUseCaseDependencies =
  createInstallUseCaseDependencies();

export async function runInstallUseCase(
  request: InstallRequest,
  dependencies: InstallUseCaseDependencies = defaultInstallUseCaseDependencies,
): Promise<InstallOutcome> {
  const installPlan = await prepareInstallPlan(request, dependencies);
  const writes = await commitInstallPlan(installPlan, dependencies.commit);

  return {
    ...installPlan.details,
    writes,
  };
}

async function prepareInstallPlan(
  request: InstallRequest,
  dependencies: InstallUseCaseDependencies,
): Promise<PreparedInstallPlan> {
  const installContext = await resolveInstallInputs(
    request,
    dependencies.input,
  );
  const tokenCommand = createTokenCommandConfig({
    codexHome: installContext.installPaths.codexHome,
    nodeExecutable: dependencies.planning.nodeExecutable,
    platform: dependencies.planning.platform,
    tokenPath: installContext.installPaths.tokenPath,
  });
  const writePhases = await planInstallManagedWritePhases({
    apiKey: installContext.apiKey,
    finalScope: installContext.scopeDetails.finalScope,
    installPaths: installContext.installPaths,
    loadTomlConfig: dependencies.planning.loadTomlConfig,
    selectedModel: installContext.selectedModel,
    tokenCommand,
  });

  return {
    details: buildInstallDetails(installContext, tokenCommand),
    localProjectConfigExcludeTarget:
      installContext.localProjectConfigExcludeTarget,
    writePhases,
  };
}

function buildInstallDetails(
  installContext: ResolvedInstallContext,
  tokenCommand: TokenCommandConfig,
): InstallDetails {
  return {
    codex: installContext.codex,
    helperPath: tokenCommand.helperFilePath,
    modelCatalogPath: installContext.installPaths.modelCatalogPath,
    projectRoot: installContext.installPaths.projectRoot,
    requestedScope: installContext.requestedScope,
    selectedModel: installContext.selectedModel,
    tokenPath: installContext.installPaths.tokenPath,
    userConfigPath: installContext.installPaths.userConfigPath,
    ...installContext.scopeDetails,
  };
}

async function resolveInstallInputs(
  request: InstallRequest,
  dependencies: InstallInputDependencies,
): Promise<ResolvedInstallContext> {
  const codex = dependencies.checkCodexAvailable();
  const apiKey = dependencies.validateApiKey(
    await dependencies.promptForApiKey(),
  );
  const selectedModel = request.modelKey
    ? requireSupportedModel(request.modelKey)
    : await dependencies.promptForModel(SUPPORTED_MODELS, DEFAULT_MODEL_KEY);
  const requestedScope =
    request.scope ?? (await dependencies.promptForScope("user"));
  const projectRoot = await resolveProjectRoot(request.cwd);
  const installPaths = resolveInstallPaths({
    environment: dependencies.environment,
    projectRoot,
  });
  const scopeResolution = await resolveInstallScope({
    inspectLocalProjectConfig: dependencies.inspectLocalProjectConfig,
    installPaths,
    promptForTrackedLocalConfigAction:
      dependencies.promptForTrackedLocalConfigAction,
    requestedScope,
  });

  return {
    apiKey,
    codex,
    installPaths,
    localProjectConfigExcludeTarget:
      scopeResolution.localProjectConfigExcludeTarget,
    requestedScope,
    selectedModel,
    scopeDetails: scopeResolution.details,
  };
}

async function commitInstallPlan(
  installPlan: PreparedInstallPlan,
  dependencies: InstallCommitDependencies,
): Promise<ManagedWriteResult[]> {
  const writes: ManagedWriteResult[] = [];

  try {
    if (installPlan.localProjectConfigExcludeTarget) {
      // Keep the repo-local config ignored only once the install is ready to commit.
      await dependencies.ensureLocalProjectConfigExcluded(
        installPlan.localProjectConfigExcludeTarget,
      );
    }

    for (const phase of installPlan.writePhases) {
      for (const plannedWrite of phase.writes) {
        writes.push(
          await dependencies.writeManagedTextFile(
            plannedWrite.filePath,
            plannedWrite.content,
            {
              backupFactory: dependencies.createBackup,
              contentComparator: plannedWrite.contentComparator,
              mode: plannedWrite.mode,
            },
          ),
        );
      }
    }
  } catch (error) {
    const rollbackFailures = await rollbackCompletedWrites(
      writes,
      dependencies.rollbackManagedTextFile,
    );
    throw new InstallCommitError(error, writes, rollbackFailures);
  }

  return writes;
}

async function rollbackCompletedWrites(
  completedWrites: readonly ManagedWriteResult[],
  rollbackWrite: InstallCommitDependencies["rollbackManagedTextFile"],
): Promise<InstallRollbackFailure[]> {
  const rollbackFailures: InstallRollbackFailure[] = [];

  for (const completedWrite of [...completedWrites].reverse()) {
    try {
      await rollbackWrite(completedWrite);
    } catch (error) {
      rollbackFailures.push({
        filePath: completedWrite.filePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return rollbackFailures;
}
