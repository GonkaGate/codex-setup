import { GONKAGATE_BASE_URL } from "../constants/gateway.js";
import {
  createSupportedModel,
  type SupportedModel,
} from "../constants/models.js";
import { describeUnknownError } from "./error-codes.js";

interface GonkagateModelsResponse {
  readonly data: readonly unknown[];
}

export async function fetchGonkagateModels(
  apiKey: string,
  fetchFn: typeof fetch = fetch,
): Promise<SupportedModel[]> {
  const endpoint = `${GONKAGATE_BASE_URL}/models`;
  let response: Response;

  try {
    response = await fetchFn(endpoint, {
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
    });
  } catch (error) {
    throw new Error(
      `Failed to fetch GonkaGate models from ${endpoint}: ${describeUnknownError(error)}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch GonkaGate models from ${endpoint}: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.`,
    );
  }

  let responseBody: unknown;

  try {
    responseBody = await response.json();
  } catch (error) {
    throw new Error(
      `Failed to parse GonkaGate /v1/models response: ${describeUnknownError(error)}`,
    );
  }

  return parseGonkagateModelsResponse(responseBody);
}

export function parseGonkagateModelsResponse(
  responseBody: unknown,
): SupportedModel[] {
  const response = requireGonkagateModelsResponse(responseBody);
  const models: SupportedModel[] = [];
  const seenIds = new Set<string>();

  for (const [index, item] of response.data.entries()) {
    const model = requireGonkagateModelItem(item, index);

    if (seenIds.has(model.id)) {
      continue;
    }

    seenIds.add(model.id);
    models.push(createSupportedModel(model.id, model.name));
  }

  if (models.length === 0) {
    throw new Error("GonkaGate /v1/models returned no models.");
  }

  return models;
}

function requireGonkagateModelsResponse(
  responseBody: unknown,
): GonkagateModelsResponse {
  const data =
    typeof responseBody === "object" &&
    responseBody !== null &&
    "data" in responseBody
      ? responseBody.data
      : undefined;

  if (
    typeof responseBody !== "object" ||
    responseBody === null ||
    !Array.isArray(data)
  ) {
    throw new Error(
      'GonkaGate /v1/models response must contain a "data" array.',
    );
  }

  return { data };
}

function requireGonkagateModelItem(
  item: unknown,
  index: number,
): { id: string; name?: string } {
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    throw new Error(`GonkaGate /v1/models data[${index}] must be an object.`);
  }

  if (!("id" in item) || typeof item.id !== "string") {
    throw new Error(`GonkaGate /v1/models data[${index}].id must be a string.`);
  }

  const id = item.id.trim();

  if (id.length === 0) {
    throw new Error(
      `GonkaGate /v1/models data[${index}].id must not be empty.`,
    );
  }

  const rawName = "name" in item ? item.name : undefined;

  if (rawName !== undefined && typeof rawName !== "string") {
    throw new Error(
      `GonkaGate /v1/models data[${index}].name must be a string when present.`,
    );
  }

  const name = typeof rawName === "string" ? rawName.trim() : undefined;

  return name && name.length > 0 ? { id, name } : { id };
}
