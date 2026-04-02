import {
  DEFAULT_MODEL_KEY,
  SUPPORTED_MODELS,
  requireSupportedModel,
  type SupportedModel,
  type SupportedModelKey,
  createCuratedModelCatalog,
} from "../constants/models.js";
import { createBackup } from "./backup.js";
import {
  checkCodexAvailable,
  type CodexAvailability,
} from "./codex-command.js";
import {
  applyLocalProjectConfig,
  applyLocalUserConfig,
  applyUserScopeConfig,
  loadTomlConfig,
  renderTomlConfig,
  type LoadedTomlConfig,
  type TomlTable,
} from "./codex-config.js";
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
  writeManagedTextFile,
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
  validateApiKey: typeof validateApiKey;
  writeManagedTextFile: typeof writeManagedTextFile;
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
  validateApiKey,
  writeManagedTextFile,
} satisfies InstallUseCaseDependencies;

export async function runInstallUseCase(
  request: InstallRequest,
  dependencies: InstallUseCaseDependencies = defaultInstallUseCaseDependencies,
): Promise<InstallOutcome> {
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
  const writes: ManagedWriteResult[] = [];

  writes.push(
    await dependencies.writeManagedTextFile(
      installPaths.tokenPath,
      `${apiKey}\n`,
      {
        backupFactory: dependencies.createBackup,
        mode: 0o600,
      },
    ),
  );
  writes.push(
    await dependencies.writeManagedTextFile(
      tokenCommand.helperFilePath,
      tokenCommand.content,
      {
        backupFactory: dependencies.createBackup,
        mode: tokenCommand.fileMode,
      },
    ),
  );
  writes.push(
    await dependencies.writeManagedTextFile(
      installPaths.modelCatalogPath,
      `${JSON.stringify(curatedCatalog, null, 2)}\n`,
      {
        backupFactory: dependencies.createBackup,
        mode: 0o600,
      },
    ),
  );

  const userConfig = await dependencies.loadTomlConfig(
    installPaths.userConfigPath,
  );
  const nextUserConfig =
    scopeResolution.finalScope === "user"
      ? applyUserScopeConfig(
          userConfig.settings,
          selectedModel,
          installPaths,
          tokenCommand,
        )
      : applyLocalUserConfig(userConfig.settings, installPaths, tokenCommand);

  writes.push(
    await writeTomlConfig(
      installPaths.userConfigPath,
      nextUserConfig,
      userConfig,
      dependencies,
    ),
  );

  if (scopeResolution.finalScope === "local") {
    const projectConfig = await dependencies.loadTomlConfig(
      installPaths.projectConfigPath,
    );
    const nextProjectConfig = applyLocalProjectConfig(
      projectConfig.settings,
      selectedModel,
      installPaths,
    );

    writes.push(
      await writeTomlConfig(
        installPaths.projectConfigPath,
        nextProjectConfig,
        projectConfig,
        dependencies,
      ),
    );
  }

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

async function writeTomlConfig(
  filePath: string,
  nextConfig: TomlTable,
  loadedConfig: LoadedTomlConfig,
  dependencies: Pick<
    InstallUseCaseDependencies,
    "createBackup" | "writeManagedTextFile"
  >,
): Promise<ManagedWriteResult> {
  const text = renderTomlConfig(nextConfig);

  if (
    loadedConfig.exists &&
    normalizeText(loadedConfig.text) === normalizeText(text)
  ) {
    return dependencies.writeManagedTextFile(filePath, text, {
      backupFactory: dependencies.createBackup,
      mode: 0o600,
      skipBackupOnChange: true,
    });
  }

  return dependencies.writeManagedTextFile(filePath, text, {
    backupFactory: dependencies.createBackup,
    mode: 0o600,
  });
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}
