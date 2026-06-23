import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  LOCAL_PROJECT_CONFIG_RELATIVE_PATH,
  resolveLocalProjectConfigPath,
} from "../../src/install/settings-paths.js";

export async function createTempWorkspace(prefix: string): Promise<string> {
  return mkdtemp(path.join(tmpdir(), `${prefix}-`));
}

export function initGitRepo(workspace: string): void {
  execFileSync("git", ["init", "--quiet"], {
    cwd: workspace,
  });
}

export async function createGitWorkspace(prefix: string): Promise<string> {
  const workspace = await createTempWorkspace(prefix);
  initGitRepo(workspace);
  return workspace;
}

export async function trackLocalProjectConfig(
  workspace: string,
  content = 'model_provider = "openai"\n',
): Promise<void> {
  await writeLocalProjectConfig(workspace, content);
  execFileSync("git", ["add", LOCAL_PROJECT_CONFIG_RELATIVE_PATH], {
    cwd: workspace,
  });
}

export async function writeLocalProjectConfig(
  workspace: string,
  content = 'model_provider = "openai"\n',
): Promise<string> {
  const configPath = resolveLocalProjectConfigPath(workspace);

  await mkdir(path.dirname(configPath), {
    recursive: true,
  });
  await writeFile(configPath, content, "utf8");

  return configPath;
}
