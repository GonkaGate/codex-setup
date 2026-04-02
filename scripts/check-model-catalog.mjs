import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import {
  DEFAULT_MODEL_SOURCE_PATH,
  DEFAULT_MODEL_TARGET_PATH,
  readModelCatalogSource,
  renderModelCatalogModule,
} from "./extract-model-catalog.mjs";

function main(argv = process.argv.slice(2)) {
  const [
    sourcePath = DEFAULT_MODEL_SOURCE_PATH,
    targetPath = DEFAULT_MODEL_TARGET_PATH,
  ] = argv;
  const resolvedSourcePath = resolve(sourcePath);
  const resolvedTargetPath = resolve(targetPath);
  const source = readModelCatalogSource(resolvedSourcePath);
  const expected = renderModelCatalogModule({
    models: source.models,
    sourcePath: resolvedSourcePath,
  });
  const actual = readFileSync(resolvedTargetPath, "utf8");

  if (actual !== expected) {
    console.error(
      `Generated model catalog is out of date at ${resolvedTargetPath}. Run: npm run model-catalog:generate`,
    );
    process.exit(1);
  }
}

main();
