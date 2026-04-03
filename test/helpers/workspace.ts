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

export async function trackLocalProjectConfig(
  workspace: string,
  content = 'model_provider = "openai"\n',
): Promise<void> {
  await mkdir(path.join(workspace, ".codex"), {
    recursive: true,
  });
  await writeFile(
    path.join(workspace, ".codex", "config.toml"),
    content,
    "utf8",
  );
  execFileSync("git", ["add", ".codex/config.toml"], {
    cwd: workspace,
  });
}
