import { readFileSync, writeFileSync } from "node:fs";

const [modelsPath, targetPath, modelSlug] = process.argv.slice(2);

if (!modelsPath || !targetPath || !modelSlug) {
  throw new Error(
    "Usage: node scripts/extract-model-catalog.mjs <models.json> <target.ts> <model-slug>",
  );
}

const models = JSON.parse(readFileSync(modelsPath, "utf8")).models;
const selected = models.find((model) => model.slug === modelSlug);

if (!selected) {
  throw new Error(`${modelSlug} is missing from upstream models.json`);
}

const fileContents = [
  "export interface ModelCatalogEntry {",
  "  slug: string;",
  "  display_name: string;",
  "  description?: string;",
  "  priority: number;",
  "  visibility: string;",
  "  supported_in_api: boolean;",
  "  [key: string]: unknown;",
  "}",
  "",
  "export interface ModelCatalog {",
  "  models: ModelCatalogEntry[];",
  "}",
  "",
  'export const GONKAGATE_MODEL_CATALOG_VERSION = "rust-v0.118.0";',
  "",
  `export const GONKAGATE_MODEL_CATALOG: ModelCatalog = ${JSON.stringify(
    { models: [selected] },
    null,
    2,
  )};`,
  "",
].join("\n");

writeFileSync(targetPath, fileContents, "utf8");
