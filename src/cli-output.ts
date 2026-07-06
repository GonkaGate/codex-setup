import { GONKAGATE_BASE_URL } from "./constants/gateway.js";
import { LOCAL_PROJECT_CONFIG_RELATIVE_PATH } from "./install/settings-paths.js";
import type { InstallOutcome } from "./install/install-use-case.js";
import type { ManagedWriteResult } from "./install/write-managed-file.js";

export function formatIntroOutput(): string {
  return [
    "Connect Codex CLI to GonkaGate in one step.",
    "",
    "This installer writes the minimum safe Codex config and keeps the secret under ~/.codex only.",
    `Base URL is fixed to ${GONKAGATE_BASE_URL}.`,
    "Models are fetched from GonkaGate /v1/models after the API key is entered.",
    "",
    "",
  ].join("\n");
}

export function formatSuccessOutput(outcome: InstallOutcome): string {
  const sections = [
    buildSuccessSummarySection(outcome),
    ...buildWriteSections(outcome.writes),
    buildNextStepsSection(),
    buildLocalScopeSection(outcome),
  ].filter((section): section is string => section !== undefined);

  return `${sections.join("\n\n")}\n`;
}

function buildSuccessSummarySection(outcome: InstallOutcome): string {
  return [
    "Install complete.",
    "",
    `Codex version: ${outcome.codex.version}`,
    `Activation scope: ${formatActivationScope(outcome)}`,
    `Model: ${outcome.selectedModel.displayName} (${outcome.selectedModel.modelId})`,
  ].join("\n");
}

function formatActivationScope(outcome: InstallOutcome): string {
  return outcome.switchedToUserScope
    ? `${outcome.finalScope} (switched from local because ${LOCAL_PROJECT_CONFIG_RELATIVE_PATH} is tracked)`
    : outcome.finalScope;
}

function buildWriteSections(writes: readonly ManagedWriteResult[]): string[] {
  const { backupPaths, changedFilePaths, unchangedFilePaths } =
    groupManagedWrites(writes);

  return [
    buildPathListSection("Updated files", changedFilePaths),
    buildPathListSection("Already up to date", unchangedFilePaths),
    buildPathListSection("Backups", backupPaths),
  ].filter((section): section is string => section !== undefined);
}

function groupManagedWrites(writes: readonly ManagedWriteResult[]): {
  backupPaths: string[];
  changedFilePaths: string[];
  unchangedFilePaths: string[];
} {
  const backupPaths: string[] = [];
  const changedFilePaths: string[] = [];
  const unchangedFilePaths: string[] = [];

  for (const write of writes) {
    if (write.changed) {
      changedFilePaths.push(write.filePath);
    } else {
      unchangedFilePaths.push(write.filePath);
    }

    if (write.backupPath) {
      backupPaths.push(write.backupPath);
    }
  }

  return {
    backupPaths,
    changedFilePaths,
    unchangedFilePaths,
  };
}

function buildPathListSection(
  title: string,
  filePaths: readonly string[],
): string | undefined {
  if (filePaths.length === 0) {
    return undefined;
  }

  return [`${title}:`, ...filePaths.map((filePath) => `- ${filePath}`)].join(
    "\n",
  );
}

function buildNextStepsSection(): string {
  return [
    "Next steps:",
    "1. Start Codex normally: codex",
    "2. In Codex, run: /status",
    "3. If the provider or model looks wrong, run: /debug-config",
  ].join("\n");
}

function buildLocalScopeSection(outcome: InstallOutcome): string | undefined {
  if (outcome.finalScope !== "local") {
    return undefined;
  }

  return [
    "Local scope details:",
    `- Project root: ${outcome.projectRoot}`,
    `- Project config: ${outcome.projectConfigPath}`,
    `- Trusted path: ${outcome.trustTargetPath}`,
  ].join("\n");
}
