import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { CONTRACT_METADATA } from "../contract-metadata.js";
import { formatIntroOutput, formatSuccessOutput } from "../src/cli-output.js";
import { GONKAGATE_BASE_URL } from "../src/constants/gateway.js";
import { DEFAULT_MODEL, DEFAULT_MODEL_KEY } from "../src/constants/models.js";
import { parseCliOptions } from "../src/cli.js";
import {
  createLocalScopeDetails,
  createUserScopeDetails,
} from "../src/install/install-scope.js";
import type { InstallOutcome } from "../src/install/install-use-case.js";
import { escapeRegExp, repoRoot } from "./contract-helpers.js";

test("parseCliOptions reads curated model and scope flags", () => {
  const options = parseCliOptions([
    "--scope",
    "local",
    "--model",
    DEFAULT_MODEL_KEY,
  ]);

  assert.equal(options.scope, "local");
  assert.equal(options.modelKey, DEFAULT_MODEL_KEY);
});

test("parseCliOptions rejects API key flags", () => {
  assert.throws(
    () => parseCliOptions(["--api-key", "gp-secret-value"]),
    /unsupported/i,
  );
});

test("CLI wrapper exposes the implemented installer entrypoint", () => {
  const binPath = resolve(repoRoot, CONTRACT_METADATA.binPath);
  const helpResult = spawnSync(process.execPath, [binPath, "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(helpResult.status, 0);
  assert.match(helpResult.stdout, /GonkaGate Codex CLI installer/i);
  assert.match(helpResult.stdout, /--scope <scope>/);
  assert.match(helpResult.stdout, /--model <model-key>/);
  assert.match(
    helpResult.stdout,
    new RegExp(escapeRegExp(CONTRACT_METADATA.publicEntrypoint)),
  );

  const versionResult = spawnSync(process.execPath, [binPath, "--version"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(versionResult.status, 0);
  assert.match(
    versionResult.stdout,
    new RegExp(escapeRegExp(CONTRACT_METADATA.cliVersion)),
  );
});

test("formatIntroOutput keeps installer framing separate from command parsing", () => {
  const output = formatIntroOutput();

  assert.match(output, /Connect Codex CLI to GonkaGate in one step\./);
  assert.match(output, new RegExp(escapeRegExp(GONKAGATE_BASE_URL)));
  assert.match(output, /Curated model choice: gpt-5\.4\./);
});

test("formatSuccessOutput groups optional sections without mixing concerns", () => {
  const output = formatSuccessOutput(
    createInstallOutcome({
      finalScope: "local",
      projectConfigPath: "/Users/test/project/.codex/config.toml",
      switchedToUserScope: true,
      trustTargetPath: "/Users/test/project",
      writes: [
        {
          backupPath: "/Users/test/.codex/config.toml.bak",
          changed: true,
          filePath: "/Users/test/.codex/config.toml",
          previouslyExisted: true,
        },
        {
          changed: false,
          filePath: "/Users/test/.codex/gonkagate/token",
          previouslyExisted: true,
        },
      ],
    }),
  );

  assert.match(output, /Install complete\./);
  assert.match(
    output,
    /Activation scope: local \(switched from local because \.codex\/config\.toml is tracked\)/,
  );
  assert.match(
    output,
    /Updated files:\n- \/Users\/test\/\.codex\/config\.toml/,
  );
  assert.match(
    output,
    /Already up to date:\n- \/Users\/test\/\.codex\/gonkagate\/token/,
  );
  assert.match(output, /Backups:\n- \/Users\/test\/\.codex\/config\.toml\.bak/);
  assert.match(
    output,
    /Local scope details:\n- Project root: \/Users\/test\/project\n- Project config: \/Users\/test\/project\/\.codex\/config\.toml\n- Trusted path: \/Users\/test\/project/,
  );
});

test("formatSuccessOutput omits empty optional sections for user scope", () => {
  const output = formatSuccessOutput(
    createInstallOutcome({
      writes: [
        {
          changed: true,
          filePath: "/Users/test/.codex/config.toml",
          previouslyExisted: false,
        },
      ],
    }),
  );

  assert.equal(output.includes("Already up to date:"), false);
  assert.equal(output.includes("Backups:"), false);
  assert.equal(output.includes("Local scope details:"), false);
});

function createInstallOutcome(
  overrides: Partial<InstallOutcome> = {},
): InstallOutcome {
  const finalScope = overrides.finalScope ?? "user";
  const scopeDetails =
    finalScope === "local"
      ? createLocalScopeDetails({
          projectConfigPath: "/Users/test/project/.codex/config.toml",
          projectRoot: "/Users/test/project",
        })
      : createUserScopeDetails(overrides.switchedToUserScope ?? false);

  return {
    ...scopeDetails,
    codex: {
      command: "codex",
      version: "0.118.0",
    },
    finalScope,
    helperPath: "/Users/test/.codex/bin/gonkagate-token",
    modelCatalogPath: "/Users/test/.codex/model-catalogs/gonkagate.json",
    projectRoot: "/Users/test/project",
    requestedScope: "user",
    selectedModel: DEFAULT_MODEL,
    switchedToUserScope: false,
    tokenPath: "/Users/test/.codex/gonkagate/token",
    userConfigPath: "/Users/test/.codex/config.toml",
    writes: [],
    ...overrides,
  };
}
