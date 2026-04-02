import process from "node:process";
import { pathToFileURL } from "node:url";
import { Command, CommanderError, Option } from "commander";
import { CONTRACT_METADATA } from "../contract-metadata.js";
import {
  DEFAULT_MODEL_KEY,
  SUPPORTED_MODELS,
  SUPPORTED_MODEL_KEYS,
} from "./constants/models.js";
import { GONKAGATE_BASE_URL } from "./constants/gateway.js";
import {
  runInstallUseCase,
  type InstallOutcome,
} from "./install/install-use-case.js";
import type { InstallScope } from "./install/settings-paths.js";

interface CliOptions {
  help: boolean;
  modelKey?: (typeof SUPPORTED_MODEL_KEYS)[number];
  scope?: InstallScope;
  version: boolean;
}

interface ParsedProgramOptions {
  model?: (typeof SUPPORTED_MODEL_KEYS)[number];
  scope?: InstallScope;
}

interface ProgramOutput {
  writeErr?: (str: string) => void;
  writeOut?: (str: string) => void;
}

function rejectApiKeyArgs(argv: string[]): void {
  if (argv.some((arg) => arg === "--api-key" || arg.startsWith("--api-key="))) {
    throw new Error(
      "Passing API keys via CLI arguments is intentionally unsupported. Run the installer interactively instead.",
    );
  }
}

function createProgram(output?: ProgramOutput): Command {
  const supportedModelLines = SUPPORTED_MODELS.map((model) => {
    const defaultSuffix = model.key === DEFAULT_MODEL_KEY ? " (default)" : "";
    return `  ${model.key}  ${model.displayName}${defaultSuffix}`;
  }).join("\n");

  const program = new Command()
    .name(CONTRACT_METADATA.binName)
    .description("GonkaGate Codex CLI installer")
    .addOption(
      new Option(
        "--model <model-key>",
        "Skip the model prompt with a curated supported model.",
      ).choices(SUPPORTED_MODEL_KEYS),
    )
    .addOption(
      new Option(
        "--scope <scope>",
        "Skip the scope prompt. Choose user or local.",
      ).choices(["user", "local"]),
    )
    .helpOption("-h, --help", "Show this help.")
    .version(
      CONTRACT_METADATA.cliVersion,
      "-v, --version",
      "Show the package version.",
    )
    .addHelpText(
      "after",
      `
Examples:
  ${CONTRACT_METADATA.publicEntrypoint}
  ${CONTRACT_METADATA.publicEntrypoint} --scope local
  ${CONTRACT_METADATA.publicEntrypoint} --model ${DEFAULT_MODEL_KEY}

Supported model keys:
${supportedModelLines}
`,
    )
    .exitOverride();

  if (output) {
    program.configureOutput(output);
  }

  return program;
}

export function parseCliOptions(
  argv: string[],
  output?: ProgramOutput,
): CliOptions {
  rejectApiKeyArgs(argv);

  const program = createProgram(output);
  program.parse(["node", CONTRACT_METADATA.binName, ...argv]);

  const options = program.opts<ParsedProgramOptions>();
  return {
    help: false,
    modelKey: options.model,
    scope: options.scope,
    version: false,
  };
}

function printIntro(): void {
  console.log("Connect Codex CLI to GonkaGate in one step.\n");
  console.log(
    "This installer writes the minimum safe Codex config and keeps the secret under ~/.codex only.",
  );
  console.log(`Base URL is fixed to ${GONKAGATE_BASE_URL}.`);
  console.log(
    `Curated model choice: ${SUPPORTED_MODELS.map((model) => model.key).join(", ")}.\n`,
  );
}

function printSuccess(outcome: InstallOutcome): void {
  console.log("\nInstall complete.\n");
  console.log(`Codex version: ${outcome.codex.version}`);
  console.log(
    `Activation scope: ${outcome.finalScope}${outcome.switchedToUserScope ? " (switched from local because .codex/config.toml is tracked)" : ""}`,
  );
  console.log(
    `Model: ${outcome.selectedModel.displayName} (${outcome.selectedModel.modelId})`,
  );

  const changedFiles = outcome.writes.filter((write) => write.changed);
  const unchangedFiles = outcome.writes.filter((write) => !write.changed);
  const backupPaths = outcome.writes
    .map((write) => write.backupPath)
    .filter((backupPath): backupPath is string => backupPath !== undefined);

  if (changedFiles.length > 0) {
    console.log("\nUpdated files:");
    for (const write of changedFiles) {
      console.log(`- ${write.filePath}`);
    }
  }

  if (unchangedFiles.length > 0) {
    console.log("\nAlready up to date:");
    for (const write of unchangedFiles) {
      console.log(`- ${write.filePath}`);
    }
  }

  if (backupPaths.length > 0) {
    console.log("\nBackups:");
    for (const backupPath of backupPaths) {
      console.log(`- ${backupPath}`);
    }
  }

  console.log("\nNext steps:");
  console.log("1. Start Codex normally: codex");
  console.log("2. In Codex, run: /status");
  console.log("3. If the provider or model looks wrong, run: /debug-config");

  if (outcome.finalScope === "local" && outcome.projectConfigPath) {
    console.log("\nLocal scope details:");
    console.log(`- Project root: ${outcome.projectRoot}`);
    console.log(`- Project config: ${outcome.projectConfigPath}`);
    console.log(`- Trusted path: ${outcome.trustTargetPath}`);
  }
}

export async function run(argv = process.argv.slice(2)): Promise<void> {
  const options = parseCliOptions(argv);

  printIntro();
  const outcome = await runInstallUseCase({
    cwd: process.cwd(),
    modelKey: options.modelKey,
    scope: options.scope,
  });
  printSuccess(outcome);
}

function handleCliError(error: unknown): void {
  if (error instanceof CommanderError) {
    process.exitCode = error.exitCode;
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nError: ${message}`);
  process.exitCode = 1;
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  run().catch(handleCliError);
}
