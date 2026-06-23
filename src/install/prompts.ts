import process from "node:process";
import { password, select } from "@inquirer/prompts";
import type { SupportedModel, SupportedModelKey } from "../constants/models.js";
import { createInstallCancelledError, PromptError } from "./install-errors.js";
import type { InstallScope } from "./settings-paths.js";

export type TrackedLocalConfigAction = "user" | "cancel";

export async function promptForApiKey(): Promise<string> {
  assertInteractiveTty();

  return password({
    mask: "*",
    message: "GonkaGate API key",
    validate: (value) =>
      value.trim().length > 0 ? true : "API key is required.",
  }).catch(rethrowPromptExit);
}

export function buildModelPromptConfig(
  models: readonly SupportedModel[],
  defaultModelKey: SupportedModelKey,
): SelectPromptConfig<SupportedModelKey> {
  if (models.length === 0) {
    throw new PromptError(
      "no_supported_models",
      "No supported GonkaGate Codex models are configured.",
    );
  }

  const defaultModel = requireModel(models, defaultModelKey);

  return buildNumberedSelectPromptConfig({
    choices: models.map((model) => {
      const modelIdDescription = `Model ID: ${model.modelId}`;

      return {
        description: model.description
          ? `${model.description} ${modelIdDescription}`
          : modelIdDescription,
        name: model.displayName,
        short: model.key,
        value: model.key,
      };
    }),
    default: defaultModel.key,
    message: "Choose a GonkaGate model for Codex CLI",
    pageSize: Math.min(models.length, 8),
  });
}

export function buildScopePromptConfig(
  defaultScope: InstallScope,
): SelectPromptConfig<InstallScope> {
  return buildNumberedSelectPromptConfig({
    choices: [
      {
        description:
          "Recommended. Configure GonkaGate globally in your user Codex config.",
        name: "User scope",
        short: "user",
        value: "user",
      },
      {
        description:
          "Keep activation in this project only. Secrets still stay under ~/.codex.",
        name: "Local scope",
        short: "local",
        value: "local",
      },
    ],
    default: defaultScope,
    message: "Choose where GonkaGate should be activated",
    pageSize: 2,
  });
}

export function buildTrackedLocalConfigActionPromptConfig(
  repoRelativeConfigPath: string,
): SelectPromptConfig<TrackedLocalConfigAction> {
  return buildNumberedSelectPromptConfig({
    choices: [
      {
        description:
          "Recommended. Keep the repository file unchanged and install GonkaGate in user scope instead.",
        name: "Switch to user scope",
        short: "user",
        value: "user",
      },
      {
        description:
          "Stop without changing anything so you can decide how to handle the tracked file first.",
        name: "Cancel",
        short: "cancel",
        value: "cancel",
      },
    ],
    default: "user",
    message: `${repoRelativeConfigPath} is already tracked by git. How should the installer continue?`,
    pageSize: 2,
  });
}

export async function promptForModel(
  models: readonly SupportedModel[],
  defaultModelKey: SupportedModelKey,
  selectRunner?: SelectPromptRunner<SupportedModelKey>,
): Promise<SupportedModel> {
  if (models.length === 1) {
    return models[0];
  }

  const selectedModelKey = await runSelectPrompt(
    buildModelPromptConfig(models, defaultModelKey),
    selectRunner,
  );
  return requireModel(models, selectedModelKey);
}

export async function promptForScope(
  defaultScope: InstallScope,
  selectRunner?: SelectPromptRunner<InstallScope>,
): Promise<InstallScope> {
  return runSelectPrompt(buildScopePromptConfig(defaultScope), selectRunner);
}

export async function promptForTrackedLocalConfigAction(
  repoRelativeConfigPath: string,
  selectRunner?: SelectPromptRunner<TrackedLocalConfigAction>,
): Promise<TrackedLocalConfigAction> {
  return runSelectPrompt(
    buildTrackedLocalConfigActionPromptConfig(repoRelativeConfigPath),
    selectRunner,
  );
}

function assertInteractiveTty(): void {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new PromptError(
      "missing_tty",
      "Interactive setup requires a TTY so prompts can be shown securely.",
    );
  }
}

function requireModel(
  models: readonly SupportedModel[],
  key: SupportedModelKey,
): SupportedModel {
  const selectedModel = models.find((model) => model.key === key);

  if (!selectedModel) {
    throw new PromptError(
      "model_registry_mismatch",
      `Configured model "${key}" is not present in the curated model registry.`,
    );
  }

  return selectedModel;
}

function buildNumberedSelectPromptConfig<Value>(
  input: Omit<SelectPromptConfig<Value>, "loop" | "theme"> & { loop?: boolean },
): SelectPromptConfig<Value> {
  return {
    ...input,
    loop: input.loop ?? false,
    theme: NUMBERED_SELECT_THEME,
  };
}

async function runSelectPrompt<Value>(
  config: SelectPromptConfig<Value>,
  selectRunner?: SelectPromptRunner<Value>,
): Promise<Value> {
  if (!selectRunner) {
    assertInteractiveTty();
  }

  const runner = selectRunner ?? runDefaultSelectPrompt;
  return runner(config).catch(rethrowPromptExit);
}

function rethrowPromptExit(error: unknown): never {
  if (
    error instanceof Error &&
    (error.name === "ExitPromptError" || error.name === "AbortPromptError")
  ) {
    throw createInstallCancelledError({
      cause: error,
    });
  }

  throw error;
}

interface SelectPromptChoice<Value> {
  description?: string;
  disabled?: boolean | string;
  name: string;
  short?: string;
  type?: never;
  value: Value;
}

type InquirerSelectConfig = Parameters<typeof select>[0];

type SelectPromptConfig<Value> = Omit<
  InquirerSelectConfig,
  "choices" | "default"
> & {
  choices: readonly SelectPromptChoice<Value>[];
  default: Value;
};

type SelectPromptRunner<Value> = (
  config: SelectPromptConfig<Value>,
) => Promise<Value>;

function runDefaultSelectPrompt<Value>(
  config: SelectPromptConfig<Value>,
): Promise<Value> {
  return select(config);
}

const NUMBERED_SELECT_THEME = {
  indexMode: "number",
} as const;
