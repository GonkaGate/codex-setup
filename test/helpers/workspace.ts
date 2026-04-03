import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

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
  execFileSync("git", ["add", ".codex/config.toml"], {
    cwd: workspace,
  });
}

export async function writeLocalProjectConfig(
  workspace: string,
  content = 'model_provider = "openai"\n',
): Promise<string> {
  const configDirectory = path.join(workspace, ".codex");
  const configPath = path.join(configDirectory, "config.toml");

  await mkdir(configDirectory, {
    recursive: true,
  });
  await writeFile(configPath, content, "utf8");

  return configPath;
}
