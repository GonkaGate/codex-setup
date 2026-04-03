import { readFile } from "node:fs/promises";
import TOML from "@iarna/toml";
import { isMissingFileError } from "./error-codes.js";

export type TomlTable = Parameters<typeof TOML.stringify>[0];
export type TomlValue = TomlTable[string];

export interface LoadedTomlConfig {
  exists: boolean;
  filePath: string;
  settings: TomlTable;
  text: string;
}

export interface ManagedTomlConfigWrite {
  content: string;
  contentComparator: (currentText: string, nextText: string) => boolean;
}

export async function loadTomlConfig(
  filePath: string,
): Promise<LoadedTomlConfig> {
  try {
    const text = await readFile(filePath, "utf8");
    const settings: TomlTable = TOML.parse(text);

    return {
      exists: true,
      filePath,
      settings,
      text,
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        exists: false,
        filePath,
        settings: {},
        text: "",
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read ${filePath} as TOML: ${message}`);
  }
}

export function renderTomlConfig(config: TomlTable): string {
  const rendered = TOML.stringify(config);
  return rendered.endsWith("\n") ? rendered : `${rendered}\n`;
}

export function createManagedTomlConfigWrite(
  config: TomlTable,
): ManagedTomlConfigWrite {
  return {
    content: renderTomlConfig(config),
    contentComparator: areEquivalentTomlTexts,
  };
}

export function mergeTomlTables(
  currentConfig: TomlTable,
  patch: TomlTable,
): TomlTable {
  const nextConfig: TomlTable = { ...currentConfig };

  for (const [key, value] of Object.entries(patch)) {
    const existingValue = nextConfig[key];

    if (isPlainTomlTable(existingValue) && isPlainTomlTable(value)) {
      nextConfig[key] = mergeTomlTables(existingValue, value);
      continue;
    }

    nextConfig[key] = cloneTomlValue(value);
  }

  return nextConfig;
}

export function areEquivalentTomlTexts(
  currentText: string,
  nextText: string,
): boolean {
  return normalizeTomlText(currentText) === normalizeTomlText(nextText);
}

function cloneTomlValue<Value extends TomlValue>(value: Value): Value {
  if (Array.isArray(value)) {
    return value.map((item) => cloneTomlValue(item)) as Value;
  }

  if (isPlainTomlTable(value)) {
    return mergeTomlTables({}, value) as Value;
  }

  return value;
}

function isPlainTomlTable(value: unknown): value is TomlTable {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    value instanceof Date
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeTomlText(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}
