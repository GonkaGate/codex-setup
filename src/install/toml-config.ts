import TOML from "@iarna/toml";
import { describeUnknownError } from "./error-codes.js";
import { readOptionalTextFile } from "./optional-text-file.js";

export type TomlTable = Parameters<typeof TOML.stringify>[0];
export type TomlValue = TomlTable[string];
type FlatTomlArray = boolean[] | Date[] | number[] | string[] | TomlTable[];
type NestedTomlArray = FlatTomlArray[];
type TomlArray = FlatTomlArray | NestedTomlArray;

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
    const text = await readOptionalTextFile(filePath);

    if (text === undefined) {
      return {
        exists: false,
        filePath,
        settings: {},
        text: "",
      };
    }

    const settings: TomlTable = TOML.parse(text);

    return {
      exists: true,
      filePath,
      settings,
      text,
    };
  } catch (error) {
    throw new Error(
      `Failed to read ${filePath} as TOML: ${describeUnknownError(error)}`,
    );
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

function cloneTomlValue(value: TomlValue): TomlValue {
  if (isTomlArray(value)) {
    return cloneTomlArray(value);
  }

  if (isPlainTomlTable(value)) {
    return mergeTomlTables({}, value);
  }

  return value;
}

function isTomlArray(value: TomlValue): value is TomlArray {
  return Array.isArray(value);
}

function cloneTomlArray(value: TomlArray): TomlArray {
  if (isNestedTomlArray(value)) {
    return value.map((item) => cloneFlatTomlArray(item));
  }

  return cloneFlatTomlArray(value);
}

function cloneFlatTomlArray(value: FlatTomlArray): FlatTomlArray {
  if (isBooleanTomlArray(value)) {
    return [...value];
  }

  if (isDateTomlArray(value)) {
    return [...value];
  }

  if (isNumberTomlArray(value)) {
    return [...value];
  }

  if (isStringTomlArray(value)) {
    return [...value];
  }

  return value.map((item) => mergeTomlTables({}, item));
}

function isNestedTomlArray(value: TomlArray): value is NestedTomlArray {
  return value.length > 0 && value.every((item) => Array.isArray(item));
}

function isBooleanTomlArray(value: FlatTomlArray): value is boolean[] {
  return value.length > 0 && value.every((item) => typeof item === "boolean");
}

function isDateTomlArray(value: FlatTomlArray): value is Date[] {
  return value.length > 0 && value.every((item) => item instanceof Date);
}

function isNumberTomlArray(value: FlatTomlArray): value is number[] {
  return value.length > 0 && value.every((item) => typeof item === "number");
}

function isStringTomlArray(value: FlatTomlArray): value is string[] {
  return value.length > 0 && value.every((item) => typeof item === "string");
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
