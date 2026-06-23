import process from "node:process";
import { pathToFileURL } from "node:url";
import { Command, CommanderError, Option } from "commander";
import { CONTRACT_METADATA } from "../contract-metadata.js";
import { formatIntroOutput, formatSuccessOutput } from "./cli-output.js";
import {
  DEFAULT_MODEL_KEY,
  SUPPORTED_MODELS,
  SUPPORTED_MODEL_KEYS,
} from "./constants/models.js";
import { describeUnknownError } from "./install/error-codes.js";
import { runInstallUseCase } from "./install/install-use-case.js";
import type { InstallScope } from "./install/settings-paths.js";

export interface CliOptions {
  modelKey?: (typeof SUPPORTED_MODEL_KEYS)[number];
  scope?: InstallScope;
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
    modelKey: options.model,
    scope: options.scope,
  };
}

function printIntro(): void {
  process.stdout.write(formatIntroOutput());
}

function printSuccess(
  outcome: Awaited<ReturnType<typeof runInstallUseCase>>,
): void {
  process.stdout.write(`\n${formatSuccessOutput(outcome)}`);
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

  console.error(`\nError: ${describeUnknownError(error)}`);
  process.exitCode = 1;
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  run().catch(handleCliError);
}
