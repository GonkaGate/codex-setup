import {
  DEFAULT_MODEL_KEY,
  SUPPORTED_MODELS,
  createCuratedModelCatalog,
  requireSupportedModel,
  type SupportedModel,
  type SupportedModelKey,
} from "../constants/models.js";
import { createBackup } from "./backup.js";
import {
  checkCodexAvailable,
  type CodexAvailability,
} from "./codex-command.js";
import {
  buildInstallConfigPlan,
  createManagedTomlConfigWrite,
  getConfigTargetsForScope,
  loadTomlConfig,
  resolveConfigTargetPath,
  type ConfigLayerTarget,
  type TomlTable,
} from "./codex-config.js";
import {
  InstallCommitError,
  type InstallRollbackFailure,
} from "./install-errors.js";
import { OWNER_READ_WRITE_MODE } from "./file-permissions.js";
import {
  ensureLocalProjectConfigExcluded,
  inspectLocalProjectConfig,
  type LocalProjectConfigInspection,
  type UntrackedLocalProjectConfigInspection,
} from "./local-git-ignore.js";
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
import { createTokenCommandConfig } from "./token-helper.js";
import { validateApiKey } from "./validate-api-key.js";
import {
  rollbackManagedTextFile,
  writeManagedTextFile,
  type ManagedTextComparator,
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

export interface InstallUseCaseDependencies {
  checkCodexAvailable: typeof checkCodexAvailable;
  createBackup: typeof createBackup;
  ensureLocalProjectConfigExcluded: typeof ensureLocalProjectConfigExcluded;
  environment: NodeJS.ProcessEnv;
  inspectLocalProjectConfig: typeof inspectLocalProjectConfig;
  loadTomlConfig: typeof loadTomlConfig;
  nodeExecutable: string;
  platform: NodeJS.Platform;
  promptForApiKey: typeof promptForApiKey;
  promptForModel: typeof promptForModel;
  promptForScope: typeof promptForScope;
  promptForTrackedLocalConfigAction: typeof promptForTrackedLocalConfigAction;
  rollbackManagedTextFile: typeof rollbackManagedTextFile;
  validateApiKey: typeof validateApiKey;
  writeManagedTextFile: typeof writeManagedTextFile;
}

interface PlannedManagedWrite {
  content: string;
  contentComparator?: ManagedTextComparator;
  filePath: string;
  mode: number;
}

interface ResolvedInstallContext {
  apiKey: string;
  codex: CodexAvailability;
  finalScope: InstallScope;
  installPaths: InstallPaths;
  localProjectConfigInspection?: UntrackedLocalProjectConfigInspection;
  requestedScope: InstallScope;
  selectedModel: SupportedModel;
  switchedToUserScope: boolean;
}

interface PreparedInstallPlan {
  details: InstallDetails;
  localProjectConfigInspection?: UntrackedLocalProjectConfigInspection;
  writes: PlannedManagedWrite[];
}

interface ScopeResolution {
  finalScope: InstallScope;
  localProjectConfigInspection?: UntrackedLocalProjectConfigInspection;
  switchedToUserScope: boolean;
}

export const defaultInstallUseCaseDependencies = {
  checkCodexAvailable,
  createBackup,
  ensureLocalProjectConfigExcluded,
  environment: process.env,
  inspectLocalProjectConfig,
  loadTomlConfig,
  nodeExecutable: process.execPath,
  platform: process.platform,
  promptForApiKey,
  promptForModel,
  promptForScope,
  promptForTrackedLocalConfigAction,
  rollbackManagedTextFile,
  validateApiKey,
  writeManagedTextFile,
} satisfies InstallUseCaseDependencies;

export async function runInstallUseCase(
  request: InstallRequest,
  dependencies: InstallUseCaseDependencies = defaultInstallUseCaseDependencies,
): Promise<InstallOutcome> {
  const installPlan = await prepareInstallPlan(request, dependencies);
  const writes = await commitInstallPlan(installPlan, dependencies);

  return {
    ...installPlan.details,
    writes,
  };
}

async function prepareInstallPlan(
  request: InstallRequest,
  dependencies: InstallUseCaseDependencies,
): Promise<PreparedInstallPlan> {
  const installContext = await resolveInstallInputs(request, dependencies);
  const tokenCommand = createTokenCommandConfig({
    codexHome: installContext.installPaths.codexHome,
    nodeExecutable: dependencies.nodeExecutable,
    platform: dependencies.platform,
    tokenPath: installContext.installPaths.tokenPath,
  });
  const writes = await planManagedWrites(
    installContext,
    tokenCommand,
    dependencies.loadTomlConfig,
  );

  return {
    details: buildInstallDetails(installContext, tokenCommand),
    localProjectConfigInspection: installContext.localProjectConfigInspection,
    writes,
  };
}

function buildInstallDetails(
  installContext: ResolvedInstallContext,
  tokenCommand: ReturnType<typeof createTokenCommandConfig>,
): InstallDetails {
  return {
    codex: installContext.codex,
    finalScope: installContext.finalScope,
    helperPath: tokenCommand.helperFilePath,
    modelCatalogPath: installContext.installPaths.modelCatalogPath,
    projectConfigPath:
      installContext.finalScope === "local"
        ? installContext.installPaths.projectConfigPath
        : undefined,
    projectRoot: installContext.installPaths.projectRoot,
    requestedScope: installContext.requestedScope,
    selectedModel: installContext.selectedModel,
    switchedToUserScope: installContext.switchedToUserScope,
    tokenPath: installContext.installPaths.tokenPath,
    trustTargetPath:
      installContext.finalScope === "local"
        ? installContext.installPaths.projectRoot
        : undefined,
    userConfigPath: installContext.installPaths.userConfigPath,
  };
}

async function resolveInstallInputs(
  request: InstallRequest,
  dependencies: Pick<
    InstallUseCaseDependencies,
    | "checkCodexAvailable"
    | "environment"
    | "inspectLocalProjectConfig"
    | "promptForApiKey"
    | "promptForModel"
    | "promptForScope"
    | "promptForTrackedLocalConfigAction"
    | "validateApiKey"
  >,
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

  const localProjectConfigInspection =
    requestedScope === "local"
      ? await dependencies.inspectLocalProjectConfig(
          installPaths.projectConfigPath,
        )
      : undefined;
  const scopeResolution = await chooseFinalScope(
    requestedScope,
    localProjectConfigInspection,
    dependencies.promptForTrackedLocalConfigAction,
  );

  return {
    apiKey,
    codex,
    finalScope: scopeResolution.finalScope,
    installPaths,
    localProjectConfigInspection: scopeResolution.localProjectConfigInspection,
    requestedScope,
    selectedModel,
    switchedToUserScope: scopeResolution.switchedToUserScope,
  };
}

async function planManagedWrites(
  installContext: ResolvedInstallContext,
  tokenCommand: ReturnType<typeof createTokenCommandConfig>,
  loadTomlConfig: InstallUseCaseDependencies["loadTomlConfig"],
): Promise<PlannedManagedWrite[]> {
  const curatedCatalog = createCuratedModelCatalog();
  const writes: PlannedManagedWrite[] = [
    {
      content: `${installContext.apiKey}\n`,
      filePath: installContext.installPaths.tokenPath,
      mode: OWNER_READ_WRITE_MODE,
    },
    {
      content: tokenCommand.content,
      filePath: tokenCommand.helperFilePath,
      mode: tokenCommand.fileMode,
    },
    {
      content: `${JSON.stringify(curatedCatalog, null, 2)}\n`,
      filePath: installContext.installPaths.modelCatalogPath,
      mode: OWNER_READ_WRITE_MODE,
    },
  ];

  const configTargets = getConfigTargetsForScope(installContext.finalScope);
  const currentConfigs = await loadCurrentConfigs(
    configTargets,
    installContext.installPaths,
    loadTomlConfig,
  );
  const configPlan = buildInstallConfigPlan({
    currentConfigs,
    finalScope: installContext.finalScope,
    paths: installContext.installPaths,
    selectedModel: installContext.selectedModel,
    tokenCommand,
  });

  writes.push(
    ...configPlan.map((entry) =>
      prepareTomlConfigWrite(
        resolveConfigTargetPath(entry.target, installContext.installPaths),
        entry.config,
      ),
    ),
  );

  return writes;
}

async function commitInstallPlan(
  installPlan: PreparedInstallPlan,
  dependencies: Pick<
    InstallUseCaseDependencies,
    | "createBackup"
    | "ensureLocalProjectConfigExcluded"
    | "rollbackManagedTextFile"
    | "writeManagedTextFile"
  >,
): Promise<ManagedWriteResult[]> {
  const writes: ManagedWriteResult[] = [];

  try {
    if (installPlan.localProjectConfigInspection) {
      // Keep the repo-local config ignored only once the install is ready to commit.
      await dependencies.ensureLocalProjectConfigExcluded(
        installPlan.localProjectConfigInspection,
      );
    }

    for (const plannedWrite of installPlan.writes) {
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
  rollbackWrite: InstallUseCaseDependencies["rollbackManagedTextFile"],
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

async function chooseFinalScope(
  requestedScope: InstallScope,
  localProjectConfigInspection: LocalProjectConfigInspection | undefined,
  promptForTrackedLocalConfigAction: InstallUseCaseDependencies["promptForTrackedLocalConfigAction"],
): Promise<ScopeResolution> {
  if (requestedScope !== "local") {
    return {
      finalScope: requestedScope,
      switchedToUserScope: false,
    };
  }

  if (
    !localProjectConfigInspection ||
    localProjectConfigInspection.kind === "outside_repo"
  ) {
    return {
      finalScope: "local",
      switchedToUserScope: false,
    };
  }

  if (localProjectConfigInspection.kind === "untracked") {
    return {
      finalScope: "local",
      localProjectConfigInspection,
      switchedToUserScope: false,
    };
  }

  const action = await promptForTrackedLocalConfigAction(
    localProjectConfigInspection.relativeConfigPath,
  );

  if (action === "user") {
    return {
      finalScope: "user",
      switchedToUserScope: true,
    };
  }

  throw new Error("Installation cancelled.");
}

function prepareTomlConfigWrite(
  filePath: string,
  nextConfig: TomlTable,
): PlannedManagedWrite {
  const managedTomlWrite = createManagedTomlConfigWrite(nextConfig);

  return {
    content: managedTomlWrite.content,
    contentComparator: managedTomlWrite.contentComparator,
    filePath,
    mode: OWNER_READ_WRITE_MODE,
  };
}

async function loadCurrentConfigs(
  configTargets: readonly ConfigLayerTarget[],
  installPaths: InstallPaths,
  loadConfig: InstallUseCaseDependencies["loadTomlConfig"],
): Promise<Partial<Record<ConfigLayerTarget, TomlTable>>> {
  const currentConfigs: Partial<Record<ConfigLayerTarget, TomlTable>> = {};

  for (const configTarget of configTargets) {
    currentConfigs[configTarget] = (
      await loadConfig(resolveConfigTargetPath(configTarget, installPaths))
    ).settings;
  }

  return currentConfigs;
}
