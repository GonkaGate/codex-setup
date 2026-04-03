import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import {
  DEFAULT_CONTRACT_DEFINITIONS_DECLARATION_PATH,
  DEFAULT_CONTRACT_DEFINITIONS_MODULE_PATH,
  DEFAULT_CONTRACT_METADATA_DECLARATION_PATH,
  DEFAULT_CONTRACT_METADATA_MODULE_PATH,
  DEFAULT_CONTRACT_SOURCE_PATH,
  DEFAULT_PACKAGE_JSON_PATH,
  formatGeneratedFile,
  readContractSource,
  readPackageContractMetadata,
  renderContractDefinitionsDeclaration,
  renderContractDefinitionsModule,
  renderContractMetadataDeclaration,
  renderContractMetadataModule,
} from "./generate-contract-files.mjs";

async function main(argv = process.argv.slice(2)) {
  const [
    sourcePath = DEFAULT_CONTRACT_SOURCE_PATH,
    packageJsonPath = DEFAULT_PACKAGE_JSON_PATH,
    definitionsModulePath = DEFAULT_CONTRACT_DEFINITIONS_MODULE_PATH,
    definitionsDeclarationPath = DEFAULT_CONTRACT_DEFINITIONS_DECLARATION_PATH,
    metadataModulePath = DEFAULT_CONTRACT_METADATA_MODULE_PATH,
    metadataDeclarationPath = DEFAULT_CONTRACT_METADATA_DECLARATION_PATH,
  ] = argv;
  const resolvedSourcePath = resolve(sourcePath);
  const resolvedPackageJsonPath = resolve(packageJsonPath);
  const source = readContractSource(resolvedSourcePath);
  const packageMetadata = readPackageContractMetadata(resolvedPackageJsonPath);
  const expectedFiles = [
    {
      actual: readFileSync(resolve(definitionsModulePath), "utf8"),
      expected: await formatGeneratedFile(
        definitionsModulePath,
        renderContractDefinitionsModule({
          source,
          sourcePath: resolvedSourcePath,
        }),
      ),
      filePath: resolve(definitionsModulePath),
    },
    {
      actual: readFileSync(resolve(definitionsDeclarationPath), "utf8"),
      expected: await formatGeneratedFile(
        definitionsDeclarationPath,
        renderContractDefinitionsDeclaration({
          source,
          sourcePath: resolvedSourcePath,
        }),
      ),
      filePath: resolve(definitionsDeclarationPath),
    },
    {
      actual: readFileSync(resolve(metadataModulePath), "utf8"),
      expected: await formatGeneratedFile(
        metadataModulePath,
        renderContractMetadataModule({
          packageJsonPath: resolvedPackageJsonPath,
          packageMetadata,
          sourcePath: resolvedSourcePath,
        }),
      ),
      filePath: resolve(metadataModulePath),
    },
    {
      actual: readFileSync(resolve(metadataDeclarationPath), "utf8"),
      expected: await formatGeneratedFile(
        metadataDeclarationPath,
        renderContractMetadataDeclaration({
          packageJsonPath: resolvedPackageJsonPath,
          packageMetadata,
          sourcePath: resolvedSourcePath,
        }),
      ),
      filePath: resolve(metadataDeclarationPath),
    },
  ];

  const staleFile = expectedFiles.find((file) => file.actual !== file.expected);

  if (staleFile) {
    console.error(
      `Generated contract file is out of date at ${staleFile.filePath}. Run: npm run contract:generate`,
    );
    process.exit(1);
  }
}

await main();
