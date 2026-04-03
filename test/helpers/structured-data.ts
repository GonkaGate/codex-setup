import assert from "node:assert/strict";
import TOML from "@iarna/toml";
import type { TomlTable } from "../../src/install/toml-config.js";

type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export function parseTomlTable(text: string): TomlTable {
  return expectTomlTable(TOML.parse(text), "parsed TOML document");
}

export function parseJsonObject(
  text: string,
  label = "parsed JSON document",
): JsonObject {
  const value: unknown = JSON.parse(text);
  return expectJsonObject(value, label);
}

export function expectTomlTable(value: unknown, label: string): TomlTable {
  if (!isTomlTable(value)) {
    assert.fail(`${label} must be a TOML table.`);
  }

  return value;
}

export function expectTomlString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    assert.fail(`${label} must be a string.`);
  }

  return value;
}

export function expectTomlBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    assert.fail(`${label} must be a boolean.`);
  }

  return value;
}

export function expectTomlStringArray(
  value: unknown,
  label: string,
): readonly string[] {
  if (!isStringArray(value)) {
    assert.fail(`${label} must be an array of strings.`);
  }

  return value;
}

export function expectJsonObject(value: unknown, label: string): JsonObject {
  if (!isJsonObject(value)) {
    assert.fail(`${label} must be a JSON object.`);
  }

  return value;
}

export function expectJsonArray(
  value: unknown,
  label: string,
): readonly JsonValue[] {
  if (!isJsonArray(value)) {
    assert.fail(`${label} must be a JSON array.`);
  }

  return value;
}

export function expectJsonString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    assert.fail(`${label} must be a string.`);
  }

  return value;
}

export function expectJsonStringRecord(
  value: unknown,
  label: string,
): Record<string, string> {
  if (!isJsonStringRecord(value)) {
    assert.fail(`${label} must be a string-to-string object.`);
  }

  return value;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isTomlTable(value: unknown): value is TomlTable {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

function isJsonArray(value: unknown): value is JsonValue[] {
  return Array.isArray(value) && value.every((item) => isJsonValue(item));
}

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => isJsonValue(item))
  );
}

function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  );
}

function isJsonStringRecord(value: unknown): value is Record<string, string> {
  return (
    isJsonObject(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

function isJsonValue(value: unknown): value is JsonValue {
  return isJsonPrimitive(value) || isJsonObject(value) || isJsonArray(value);
}
