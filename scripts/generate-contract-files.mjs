import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import prettier from "prettier";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");

export const DEFAULT_CONTRACT_SOURCE_PATH = resolve(
  scriptDir,
  "contract-source.json",
);
export const DEFAULT_PACKAGE_JSON_PATH = resolve(repoRoot, "package.json");
export const DEFAULT_CONTRACT_DEFINITIONS_MODULE_PATH = resolve(
  repoRoot,
  "contract-definitions.js",
);
export const DEFAULT_CONTRACT_DEFINITIONS_DECLARATION_PATH = resolve(
  repoRoot,
  "contract-definitions.d.ts",
);
export const DEFAULT_CONTRACT_METADATA_MODULE_PATH = resolve(
  repoRoot,
  "contract-metadata.js",
);
export const DEFAULT_CONTRACT_METADATA_DECLARATION_PATH = resolve(
  repoRoot,
  "contract-metadata.d.ts",
);

export function readContractSource(sourcePath = DEFAULT_CONTRACT_SOURCE_PATH) {
  const resolvedSourcePath = resolve(sourcePath);
  const source = JSON.parse(readFileSync(resolvedSourcePath, "utf8"));

  assertContractSourceShape(source, resolvedSourcePath);
  return source;
}

export function readPackageContractMetadata(
  packageJsonPath = DEFAULT_PACKAGE_JSON_PATH,
) {
  const resolvedPackageJsonPath = resolve(packageJsonPath);
  const packageJson = JSON.parse(readFileSync(resolvedPackageJsonPath, "utf8"));
  const [binName, binPath] = Object.entries(packageJson.bin ?? {})[0] ?? [];

  if (!binName || !binPath) {
    throw new Error(
      `Expected ${resolvedPackageJsonPath} to declare the installer bin entry.`,
    );
  }

  if (typeof packageJson.name !== "string" || packageJson.name.length === 0) {
    throw new Error(`Expected ${resolvedPackageJsonPath} to declare a name.`);
  }

  if (
    typeof packageJson.version !== "string" ||
    packageJson.version.length === 0
  ) {
    throw new Error(
      `Expected ${resolvedPackageJsonPath} to declare a version.`,
    );
  }

  return {
    binName,
    binPath,
    cliVersion: packageJson.version,
    packageName: packageJson.name,
    publicEntrypoint: `npx ${packageJson.name}`,
  };
}

export function renderContractDefinitionsModule({
  source,
  sourcePath = DEFAULT_CONTRACT_SOURCE_PATH,
} = {}) {
  if (!source) {
    throw new Error(
      "Expected renderContractDefinitionsModule() to receive source.",
    );
  }

  return [
    ...renderGeneratedHeader({
      sourceLabels: [formatSourceLabel(sourcePath)],
    }),
    `export const SUPPORTED_MODELS_CONTRACT = ${JSON.stringify(source.supportedModels, null, 2)};`,
    "",
    `export const VERIFIED_CODEX_CONTRACT = ${JSON.stringify(source.verifiedCodex, null, 2)};`,
    "",
  ].join("\n");
}

export function renderContractDefinitionsDeclaration({
  source,
  sourcePath = DEFAULT_CONTRACT_SOURCE_PATH,
} = {}) {
  if (!source) {
    throw new Error(
      "Expected renderContractDefinitionsDeclaration() to receive source.",
    );
  }

  return [
    ...renderGeneratedHeader({
      sourceLabels: [formatSourceLabel(sourcePath)],
    }),
    `export const SUPPORTED_MODELS_CONTRACT: ${renderDeclarationLiteral(source.supportedModels)};`,
    "",
    "export type SupportedModelContractDefinition =",
    "  (typeof SUPPORTED_MODELS_CONTRACT)[number];",
    "",
    `export const VERIFIED_CODEX_CONTRACT: ${renderDeclarationLiteral(source.verifiedCodex)};`,
    "",
    "export type VerifiedCodexContractDefinition = typeof VERIFIED_CODEX_CONTRACT;",
    "",
  ].join("\n");
}

export function renderContractMetadataModule({
  packageMetadata,
  packageJsonPath = DEFAULT_PACKAGE_JSON_PATH,
  sourcePath = DEFAULT_CONTRACT_SOURCE_PATH,
} = {}) {
  if (!packageMetadata) {
    throw new Error(
      "Expected renderContractMetadataModule() to receive metadata.",
    );
  }

  return [
    ...renderGeneratedHeader({
      sourceLabels: [
        formatSourceLabel(packageJsonPath),
        formatSourceLabel(sourcePath),
      ],
    }),
    'import { SUPPORTED_MODELS_CONTRACT, VERIFIED_CODEX_CONTRACT } from "./contract-definitions.js";',
    "",
    "export const CONTRACT_METADATA = {",
    `  binName: ${JSON.stringify(packageMetadata.binName)},`,
    `  binPath: ${JSON.stringify(packageMetadata.binPath)},`,
    `  cliVersion: ${JSON.stringify(packageMetadata.cliVersion)},`,
    `  packageName: ${JSON.stringify(packageMetadata.packageName)},`,
    `  publicEntrypoint: ${JSON.stringify(packageMetadata.publicEntrypoint)},`,
    "  supportedModels: SUPPORTED_MODELS_CONTRACT,",
    "  verifiedCodex: VERIFIED_CODEX_CONTRACT,",
    "};",
    "",
  ].join("\n");
}

export function renderContractMetadataDeclaration({
  packageMetadata,
  packageJsonPath = DEFAULT_PACKAGE_JSON_PATH,
  sourcePath = DEFAULT_CONTRACT_SOURCE_PATH,
} = {}) {
  if (!packageMetadata) {
    throw new Error(
      "Expected renderContractMetadataDeclaration() to receive metadata.",
    );
  }

  return [
    ...renderGeneratedHeader({
      sourceLabels: [
        formatSourceLabel(packageJsonPath),
        formatSourceLabel(sourcePath),
      ],
    }),
    "export interface ContractMetadata {",
    `  readonly binName: ${renderDeclarationLiteral(packageMetadata.binName)};`,
    `  readonly binPath: ${renderDeclarationLiteral(packageMetadata.binPath)};`,
    `  readonly cliVersion: ${renderDeclarationLiteral(packageMetadata.cliVersion)};`,
    `  readonly packageName: ${renderDeclarationLiteral(packageMetadata.packageName)};`,
    `  readonly publicEntrypoint: ${renderDeclarationLiteral(packageMetadata.publicEntrypoint)};`,
    '  readonly supportedModels: typeof import("./contract-definitions.js").SUPPORTED_MODELS_CONTRACT;',
    '  readonly verifiedCodex: typeof import("./contract-definitions.js").VERIFIED_CODEX_CONTRACT;',
    "}",
    "",
    "export const CONTRACT_METADATA: ContractMetadata;",
    "",
  ].join("\n");
}

export async function formatGeneratedFile(filePath, content) {
  return prettier.format(content, {
    filepath: resolve(filePath),
  });
}

export async function writeContractFiles({
  sourcePath = DEFAULT_CONTRACT_SOURCE_PATH,
  packageJsonPath = DEFAULT_PACKAGE_JSON_PATH,
  definitionsModulePath = DEFAULT_CONTRACT_DEFINITIONS_MODULE_PATH,
  definitionsDeclarationPath = DEFAULT_CONTRACT_DEFINITIONS_DECLARATION_PATH,
  metadataModulePath = DEFAULT_CONTRACT_METADATA_MODULE_PATH,
  metadataDeclarationPath = DEFAULT_CONTRACT_METADATA_DECLARATION_PATH,
} = {}) {
  const source = readContractSource(sourcePath);
  const packageMetadata = readPackageContractMetadata(packageJsonPath);
  const definitionsModule = renderContractDefinitionsModule({
    source,
    sourcePath,
  });
  const definitionsDeclaration = renderContractDefinitionsDeclaration({
    source,
    sourcePath,
  });
  const metadataModule = renderContractMetadataModule({
    packageMetadata,
    packageJsonPath,
    sourcePath,
  });
  const metadataDeclaration = renderContractMetadataDeclaration({
    packageMetadata,
    packageJsonPath,
    sourcePath,
  });

  const formattedDefinitionsModule = await formatGeneratedFile(
    definitionsModulePath,
    definitionsModule,
  );
  const formattedDefinitionsDeclaration = await formatGeneratedFile(
    definitionsDeclarationPath,
    definitionsDeclaration,
  );
  const formattedMetadataModule = await formatGeneratedFile(
    metadataModulePath,
    metadataModule,
  );
  const formattedMetadataDeclaration = await formatGeneratedFile(
    metadataDeclarationPath,
    metadataDeclaration,
  );

  writeFileSync(
    resolve(definitionsModulePath),
    formattedDefinitionsModule,
    "utf8",
  );
  writeFileSync(
    resolve(definitionsDeclarationPath),
    formattedDefinitionsDeclaration,
    "utf8",
  );
  writeFileSync(resolve(metadataModulePath), formattedMetadataModule, "utf8");
  writeFileSync(
    resolve(metadataDeclarationPath),
    formattedMetadataDeclaration,
    "utf8",
  );

  return {
    definitionsDeclaration: formattedDefinitionsDeclaration,
    definitionsModule: formattedDefinitionsModule,
    metadataDeclaration: formattedMetadataDeclaration,
    metadataModule: formattedMetadataModule,
  };
}

function assertContractSourceShape(source, sourcePath) {
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    throw new Error(`Expected ${sourcePath} to contain an object.`);
  }

  if (
    !Array.isArray(source.supportedModels) ||
    source.supportedModels.length < 1
  ) {
    throw new Error(
      `Expected ${sourcePath} to contain a non-empty "supportedModels" array.`,
    );
  }

  for (const [index, model] of source.supportedModels.entries()) {
    if (typeof model !== "object" || model === null || Array.isArray(model)) {
      throw new Error(
        `Expected supportedModels[${index}] in ${sourcePath} to be an object.`,
      );
    }

    assertNonEmptyString(
      model.key,
      `${sourcePath} supportedModels[${index}].key`,
    );
    assertNonEmptyString(
      model.displayName,
      `${sourcePath} supportedModels[${index}].displayName`,
    );
    assertNonEmptyString(
      model.modelId,
      `${sourcePath} supportedModels[${index}].modelId`,
    );

    if (model.description !== undefined) {
      assertNonEmptyString(
        model.description,
        `${sourcePath} supportedModels[${index}].description`,
      );
    }

    if (typeof model.isDefault !== "boolean") {
      throw new Error(
        `Expected ${sourcePath} supportedModels[${index}].isDefault to be a boolean.`,
      );
    }
  }

  const defaultModelCount = source.supportedModels.filter(
    (model) => model.isDefault,
  ).length;

  if (defaultModelCount !== 1) {
    throw new Error(
      `Expected ${sourcePath} to declare exactly one default supported model, found ${defaultModelCount}.`,
    );
  }

  if (
    typeof source.verifiedCodex !== "object" ||
    source.verifiedCodex === null ||
    Array.isArray(source.verifiedCodex)
  ) {
    throw new Error(
      `Expected ${sourcePath} to contain a "verifiedCodex" object.`,
    );
  }

  assertNonEmptyString(
    source.verifiedCodex.minVersion,
    `${sourcePath} verifiedCodex.minVersion`,
  );
  assertNonEmptyString(
    source.verifiedCodex.modelCatalogVersion,
    `${sourcePath} verifiedCodex.modelCatalogVersion`,
  );
  assertNonEmptyString(
    source.verifiedCodex.verifiedDate,
    `${sourcePath} verifiedCodex.verifiedDate`,
  );
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected ${label} to be a non-empty string.`);
  }
}

function renderGeneratedHeader({ sourceLabels }) {
  return [
    "// This file is generated by `npm run contract:generate`.",
    `// Source snapshot: ${sourceLabels.join(" + ")}`,
    "// Do not edit by hand.",
    "",
  ];
}

function formatSourceLabel(filePath) {
  const resolvedPath = resolve(filePath);
  return relative(repoRoot, resolvedPath) || resolvedPath;
}

function renderDeclarationLiteral(value, indentLevel = 0) {
  const indent = "  ".repeat(indentLevel);
  const nestedIndent = "  ".repeat(indentLevel + 1);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "readonly []";
    }

    return [
      "readonly [",
      value
        .map(
          (item) =>
            `${nestedIndent}${renderDeclarationLiteral(item, indentLevel + 1)},`,
        )
        .join("\n"),
      `${indent}]`,
    ].join("\n");
  }

  if (value === null) {
    return "null";
  }

  switch (typeof value) {
    case "boolean":
    case "number":
      return String(value);
    case "string":
      return JSON.stringify(value);
    case "object": {
      const entries = Object.entries(value);

      if (entries.length === 0) {
        return "{}";
      }

      return [
        "{",
        entries
          .map(
            ([key, itemValue]) =>
              `${nestedIndent}readonly ${renderDeclarationPropertyKey(key)}: ${renderDeclarationLiteral(itemValue, indentLevel + 1)};`,
          )
          .join("\n"),
        `${indent}}`,
      ].join("\n");
    }
    default:
      throw new Error(`Unsupported declaration literal type: ${typeof value}.`);
  }
}

function renderDeclarationPropertyKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key) ? key : JSON.stringify(key);
}

async function main(argv = process.argv.slice(2)) {
  const [
    sourcePath = DEFAULT_CONTRACT_SOURCE_PATH,
    packageJsonPath = DEFAULT_PACKAGE_JSON_PATH,
  ] = argv;

  await writeContractFiles({
    packageJsonPath,
    sourcePath,
  });
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  await main();
}
