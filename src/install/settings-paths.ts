import path from "node:path";
import { homedir } from "node:os";
import { findGitContext } from "./git-context.js";

export type InstallScope = "user" | "local";
export const LOCAL_PROJECT_CONFIG_RELATIVE_PATH = ".codex/config.toml";
const LOCAL_PROJECT_CONFIG_PATH_SEGMENTS =
  LOCAL_PROJECT_CONFIG_RELATIVE_PATH.split("/");

export interface ResolveInstallPathsInput {
  environment?: NodeJS.ProcessEnv;
  projectRoot: string;
}

export interface InstallPaths {
  codexHome: string;
  modelCatalogPath: string;
  projectConfigPath: string;
  projectRoot: string;
  tokenPath: string;
  userConfigPath: string;
}

export function resolveCodexHome(
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const codexHome = environment.CODEX_HOME?.trim();
  return codexHome ? path.resolve(codexHome) : path.join(homedir(), ".codex");
}

export function resolveLocalProjectConfigPath(projectRoot: string): string {
  return path.join(
    path.resolve(projectRoot),
    ...LOCAL_PROJECT_CONFIG_PATH_SEGMENTS,
  );
}

export function resolveInstallPaths(
  input: ResolveInstallPathsInput,
): InstallPaths {
  const codexHome = resolveCodexHome(input.environment);
  const projectRoot = path.resolve(input.projectRoot);

  return {
    codexHome,
    modelCatalogPath: path.join(codexHome, "model-catalogs", "gonkagate.json"),
    projectConfigPath: resolveLocalProjectConfigPath(projectRoot),
    projectRoot,
    tokenPath: path.join(codexHome, "gonkagate", "token"),
    userConfigPath: path.join(codexHome, "config.toml"),
  };
}

export async function resolveProjectRoot(
  startDirectory: string,
): Promise<string> {
  const gitContext = await findGitContext(startDirectory);
  return gitContext?.repoRoot ?? path.resolve(startDirectory);
}
