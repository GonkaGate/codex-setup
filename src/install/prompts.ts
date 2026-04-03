import process from "node:process";
import { password, select } from "@inquirer/prompts";
import type { SupportedModel, SupportedModelKey } from "../constants/models.js";
import { PromptError } from "./install-errors.js";
import type { InstallScope } from "./settings-paths.js";

export type TrackedLocalConfigAction = "user" | "cancel";

interface SelectChoice<Value> {
  description?: string;
  name: string;
  short?: string;
  value: Value;
}

interface SelectPromptConfig<Value> {
  choices: readonly SelectChoice<Value>[];
  default: Value;
  loop?: boolean;
  message: string;
  pageSize?: number;
  theme?: {
    indexMode?: "hidden" | "number";
  };
}

type SelectPrompt<Value> = (
  config: SelectPromptConfig<Value>,
) => Promise<Value>;

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

  return {
    choices: models.map((model) => ({
      description: model.description
        ? `${model.description} Model ID: ${model.modelId}`
        : `Model ID: ${model.modelId}`,
      name: model.displayName,
      short: model.key,
      value: model.key,
    })),
    default: defaultModel.key,
    loop: false,
    message: "Choose a GonkaGate model for Codex CLI",
    pageSize: Math.min(models.length, 8),
    theme: {
      indexMode: "number",
    },
  };
}

export async function promptForModel(
  models: readonly SupportedModel[],
  defaultModelKey: SupportedModelKey,
  selectPrompt: SelectPrompt<SupportedModelKey> = select as SelectPrompt<SupportedModelKey>,
): Promise<SupportedModel> {
  if (models.length === 1) {
    return models[0];
  }

  const selectedModelKey = await selectPrompt(
    buildModelPromptConfig(models, defaultModelKey),
  ).catch(rethrowPromptExit);
  return requireModel(models, selectedModelKey);
}

export async function promptForScope(
  defaultScope: InstallScope,
  selectPrompt: SelectPrompt<InstallScope> = select as SelectPrompt<InstallScope>,
): Promise<InstallScope> {
  assertInteractiveTty();

  return selectPrompt({
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
    loop: false,
    message: "Choose where GonkaGate should be activated",
    pageSize: 2,
    theme: {
      indexMode: "number",
    },
  }).catch(rethrowPromptExit);
}

export async function promptForTrackedLocalConfigAction(
  relativeConfigPath: string,
  selectPrompt: SelectPrompt<TrackedLocalConfigAction> = select as SelectPrompt<TrackedLocalConfigAction>,
): Promise<TrackedLocalConfigAction> {
  assertInteractiveTty();

  return selectPrompt({
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
    loop: false,
    message: `${relativeConfigPath} is already tracked by git. How should the installer continue?`,
    pageSize: 2,
    theme: {
      indexMode: "number",
    },
  }).catch(rethrowPromptExit);
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

function rethrowPromptExit(error: unknown): never {
  if (
    error instanceof Error &&
    (error.name === "ExitPromptError" || error.name === "AbortPromptError")
  ) {
    throw new PromptError("cancelled", "Installation cancelled.", {
      cause: error,
    });
  }

  throw error;
}
