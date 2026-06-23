import path from "node:path";
import { OWNER_READ_WRITE_EXECUTE_MODE } from "./file-permissions.js";

export interface TokenCommandConfig {
  args: string[];
  command: string;
  content: string;
  fileMode: number;
  helperFilePath: string;
}

interface CreateTokenCommandConfigInput {
  codexHome: string;
  nodeExecutable: string;
  platform: NodeJS.Platform;
  tokenPath: string;
}

export function createTokenCommandConfig(
  input: CreateTokenCommandConfigInput,
): TokenCommandConfig {
  const helperFilePath =
    input.platform === "win32"
      ? path.join(input.codexHome, "bin", "gonkagate-token.js")
      : path.join(input.codexHome, "bin", "gonkagate-token");

  return {
    args: input.platform === "win32" ? [helperFilePath] : [],
    command: input.platform === "win32" ? input.nodeExecutable : helperFilePath,
    content: createTokenHelperContent(
      input.tokenPath,
      input.platform !== "win32",
    ),
    fileMode: OWNER_READ_WRITE_EXECUTE_MODE,
    helperFilePath,
  };
}

function createTokenHelperContent(
  tokenPath: string,
  includeShebang: boolean,
): string {
  const lines = [
    includeShebang ? "#!/usr/bin/env node" : "",
    'import { readFileSync } from "node:fs";',
    'import process from "node:process";',
    "",
    "try {",
    `  const token = readFileSync(${JSON.stringify(tokenPath)}, "utf8").trim();`,
    "  if (token.length === 0) {",
    '    throw new Error("Token file is empty.");',
    "  }",
    "  process.stdout.write(token);",
    "} catch (error) {",
    "  const message = error instanceof Error ? error.message : String(error);",
    "  process.stderr.write(`Failed to read GonkaGate token: ${message}\\n`);",
    "  process.exit(1);",
    "}",
    "",
  ];

  return lines
    .filter((line, index) => includeShebang || index !== 0)
    .join("\n");
}
