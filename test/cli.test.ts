import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { CONTRACT_METADATA } from "../contract-metadata.js";
import { formatIntroOutput, formatSuccessOutput } from "../src/cli-output.js";
import { GONKAGATE_BASE_URL } from "../src/constants/gateway.js";
import { DEFAULT_MODEL_KEY } from "../src/constants/models.js";
import { parseCliOptions } from "../src/cli.js";
import {
  createLocalScopeDetails,
  createUserScopeDetails,
} from "../src/install/install-scope.js";
import type { InstallOutcome } from "../src/install/install-use-case.js";
import { escapeRegExp, repoRoot } from "./contract-helpers.js";
import {
  TEST_LOCAL_SCOPE_PATHS,
  createCommonInstallOutcomeFields as createTestInstallOutcomeFields,
} from "./helpers/install-fixtures.js";

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
    createLocalInstallOutcome({
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
  assert.match(output, /Activation scope: local/);
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

test("formatSuccessOutput explains when a local request switches to user scope", () => {
  const output = formatSuccessOutput(
    createUserInstallOutcome({
      requestedScope: "local",
      switchedToUserScope: true,
    }),
  );

  assert.match(output, /Activation scope: user/);
  assert.match(
    output,
    /switched from local because \.codex\/config\.toml is tracked/,
  );
  assert.equal(output.includes("Local scope details:"), false);
});

test("formatSuccessOutput omits empty optional sections for user scope", () => {
  const output = formatSuccessOutput(
    createUserInstallOutcome({
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

type UserInstallOutcome = Extract<InstallOutcome, { finalScope: "user" }>;
type LocalInstallOutcome = Extract<InstallOutcome, { finalScope: "local" }>;

function createUserInstallOutcome(
  overrides: Partial<UserInstallOutcome> = {},
): UserInstallOutcome {
  return {
    ...createUserScopeDetails(overrides.switchedToUserScope ?? false),
    ...createTestInstallOutcomeFields(),
    requestedScope: "user",
    writes: [],
    ...overrides,
  };
}

function createLocalInstallOutcome(
  overrides: Partial<LocalInstallOutcome> = {},
): LocalInstallOutcome {
  return {
    ...createLocalScopeDetails(TEST_LOCAL_SCOPE_PATHS),
    ...createTestInstallOutcomeFields(),
    requestedScope: "local",
    writes: [],
    ...overrides,
  };
}
