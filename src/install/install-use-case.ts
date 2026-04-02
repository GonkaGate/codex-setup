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
  getConfigTargetsForScope,
  loadTomlConfig,
  renderTomlConfig,
  type ConfigLayerTarget,
  type TomlTable,
} from "./codex-config.js";
import {
  InstallCommitError,
  type InstallRollbackFailure,
} from "./install-errors.js";
import {
  ensureLocalProjectConfigIgnored,
  TrackedLocalProjectConfigError,
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

export interface InstallOutcome {
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
  writes: ManagedWriteResult[];
}

export interface InstallUseCaseDependencies {
  checkCodexAvailable: typeof checkCodexAvailable;
  createBackup: typeof createBackup;
  ensureLocalProjectConfigIgnored: typeof ensureLocalProjectConfigIgnored;
  environment: NodeJS.ProcessEnv;
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

interface PreparedManagedWrite {
  content: string;
  contentComparator?: ManagedTextComparator;
  filePath: string;
  mode: number;
}

interface PreparedInstallPlan {
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
  writes: PreparedManagedWrite[];
}

export const defaultInstallUseCaseDependencies = {
  checkCodexAvailable,
  createBackup,
  ensureLocalProjectConfigIgnored,
  environment: process.env,
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
    codex: installPlan.codex,
    finalScope: installPlan.finalScope,
    helperPath: installPlan.helperPath,
    modelCatalogPath: installPlan.modelCatalogPath,
    projectConfigPath: installPlan.projectConfigPath,
    projectRoot: installPlan.projectRoot,
    requestedScope: installPlan.requestedScope,
    selectedModel: installPlan.selectedModel,
    switchedToUserScope: installPlan.switchedToUserScope,
    tokenPath: installPlan.tokenPath,
    trustTargetPath: installPlan.trustTargetPath,
    userConfigPath: installPlan.userConfigPath,
    writes,
  };
}

async function prepareInstallPlan(
  request: InstallRequest,
  dependencies: InstallUseCaseDependencies,
): Promise<PreparedInstallPlan> {
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
    cwd: projectRoot,
    environment: dependencies.environment,
  });

  const scopeResolution = await resolveFinalScope(
    requestedScope,
    installPaths,
    dependencies,
  );
  const tokenCommand = createTokenCommandConfig({
    codexHome: installPaths.codexHome,
    nodeExecutable: dependencies.nodeExecutable,
    platform: dependencies.platform,
    tokenPath: installPaths.tokenPath,
  });
  const curatedCatalog = createCuratedModelCatalog();
  const writes: PreparedManagedWrite[] = [
    {
      content: `${apiKey}\n`,
      filePath: installPaths.tokenPath,
      mode: 0o600,
    },
    {
      content: tokenCommand.content,
      filePath: tokenCommand.helperFilePath,
      mode: tokenCommand.fileMode,
    },
    {
      content: `${JSON.stringify(curatedCatalog, null, 2)}\n`,
      filePath: installPaths.modelCatalogPath,
      mode: 0o600,
    },
  ];

  const configTargets = getConfigTargetsForScope(scopeResolution.finalScope);
  const currentConfigs = await loadCurrentConfigs(
    configTargets,
    installPaths,
    dependencies.loadTomlConfig,
  );
  const configPlan = buildInstallConfigPlan({
    currentConfigs,
    finalScope: scopeResolution.finalScope,
    paths: installPaths,
    selectedModel,
    tokenCommand,
  });

  writes.push(
    ...configPlan.map((entry) =>
      prepareTomlConfigWrite(
        resolveConfigTargetPath(entry.target, installPaths),
        entry.config,
      ),
    ),
  );

  return {
    codex,
    finalScope: scopeResolution.finalScope,
    helperPath: tokenCommand.helperFilePath,
    modelCatalogPath: installPaths.modelCatalogPath,
    projectConfigPath:
      scopeResolution.finalScope === "local"
        ? installPaths.projectConfigPath
        : undefined,
    projectRoot: installPaths.projectRoot,
    requestedScope,
    selectedModel,
    switchedToUserScope: scopeResolution.switchedToUserScope,
    tokenPath: installPaths.tokenPath,
    trustTargetPath:
      scopeResolution.finalScope === "local"
        ? installPaths.projectRoot
        : undefined,
    userConfigPath: installPaths.userConfigPath,
    writes,
  };
}

async function commitInstallPlan(
  installPlan: PreparedInstallPlan,
  dependencies: Pick<
    InstallUseCaseDependencies,
    "createBackup" | "rollbackManagedTextFile" | "writeManagedTextFile"
  >,
): Promise<ManagedWriteResult[]> {
  const writes: ManagedWriteResult[] = [];

  try {
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

async function resolveFinalScope(
  requestedScope: InstallScope,
  installPaths: InstallPaths,
  dependencies: Pick<
    InstallUseCaseDependencies,
    "ensureLocalProjectConfigIgnored" | "promptForTrackedLocalConfigAction"
  >,
): Promise<{ finalScope: InstallScope; switchedToUserScope: boolean }> {
  if (requestedScope !== "local") {
    return {
      finalScope: requestedScope,
      switchedToUserScope: false,
    };
  }

  try {
    await dependencies.ensureLocalProjectConfigIgnored(
      installPaths.projectConfigPath,
    );
    return {
      finalScope: "local",
      switchedToUserScope: false,
    };
  } catch (error) {
    if (!(error instanceof TrackedLocalProjectConfigError)) {
      throw error;
    }

    const action = await dependencies.promptForTrackedLocalConfigAction(
      error.relativeTargetPath,
    );

    if (action === "user") {
      return {
        finalScope: "user",
        switchedToUserScope: true,
      };
    }

    throw new Error("Installation cancelled.");
  }
}

function prepareTomlConfigWrite(
  filePath: string,
  nextConfig: TomlTable,
): PreparedManagedWrite {
  return {
    content: renderTomlConfig(nextConfig),
    contentComparator: areNormalizedTextsEqual,
    filePath,
    mode: 0o600,
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

function resolveConfigTargetPath(
  configTarget: ConfigLayerTarget,
  installPaths: InstallPaths,
): string {
  return configTarget === "project"
    ? installPaths.projectConfigPath
    : installPaths.userConfigPath;
}

function areNormalizedTextsEqual(
  currentText: string,
  nextText: string,
): boolean {
  return normalizeText(currentText) === normalizeText(nextText);
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}
