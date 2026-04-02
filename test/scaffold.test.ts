import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { CONTRACT_METADATA } from "../contract-metadata.js";
import {
  GONKAGATE_BASE_URL,
  GONKAGATE_PROVIDER_ID,
} from "../src/constants/gateway.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const mirroredSkillDirectories = [
  "codex-compatibility-audit",
  "coding-prompt-normalizer",
  "technical-design-review",
  "typescript-coder",
  "verification-before-completion",
] as const;

function readText(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function listRelativeFiles(rootPath: string): string[] {
  return readdirSync(rootPath, {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(rootPath, resolve(entry.parentPath, entry.name)))
    .sort();
}

function assertMatchesAll(text: string, patterns: readonly RegExp[]): void {
  for (const pattern of patterns) {
    assert.match(text, pattern);
  }
}

function assertMirroredSkillDirectory(skillDirectory: string): void {
  const agentRoot = resolve(repoRoot, ".agents/skills", skillDirectory);
  const claudeRoot = resolve(repoRoot, ".claude/skills", skillDirectory);

  assert.equal(existsSync(agentRoot), true, `Missing ${agentRoot}`);
  assert.equal(existsSync(claudeRoot), true, `Missing ${claudeRoot}`);

  const agentFiles = listRelativeFiles(agentRoot);
  const claudeFiles = listRelativeFiles(claudeRoot);
  assert.deepEqual(claudeFiles, agentFiles);

  for (const relativePath of agentFiles) {
    assert.equal(
      readFileSync(resolve(agentRoot, relativePath), "utf8"),
      readFileSync(resolve(claudeRoot, relativePath), "utf8"),
    );
  }
}

test("package metadata matches the installer contract", () => {
  const packageJson = JSON.parse(readText("package.json")) as {
    bin: Record<string, string>;
    name: string;
    scripts: Record<string, string>;
    type: string;
    version: string;
  };

  assert.equal(packageJson.name, CONTRACT_METADATA.packageName);
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.version, CONTRACT_METADATA.cliVersion);
  assert.equal(
    packageJson.bin[CONTRACT_METADATA.binName],
    CONTRACT_METADATA.binPath,
  );
  assert.match(
    packageJson.scripts["model-catalog:generate"],
    /scripts\/extract-model-catalog\.mjs/,
  );
  assert.match(
    packageJson.scripts["model-catalog:check"],
    /scripts\/check-model-catalog\.mjs/,
  );
  assert.match(packageJson.scripts.test, /npm run build/);
  assert.match(packageJson.scripts.ci, /npm run typecheck/);
  assert.match(packageJson.scripts.ci, /npm run test/);
  assert.match(packageJson.scripts.ci, /npm run model-catalog:check/);
  assert.match(packageJson.scripts.ci, /npm run package:check/);
});

test("README captures the current Codex installer decisions", () => {
  const readme = readText("README.md");

  assertMatchesAll(readme, [
    new RegExp(escapeRegExp(CONTRACT_METADATA.publicEntrypoint)),
    /~\/\.codex\/config\.toml/,
    /\.codex\/config\.toml/,
    new RegExp(escapeRegExp(`model_provider = "${GONKAGATE_PROVIDER_ID}"`)),
    new RegExp(escapeRegExp(GONKAGATE_BASE_URL)),
    /wire_api = "responses"/,
    /model_catalog_json/,
    /command-backed bearer token/i,
    new RegExp(escapeRegExp(CONTRACT_METADATA.verifiedCodex.minVersion)),
  ]);

  for (const model of CONTRACT_METADATA.supportedModels) {
    assert.match(readme, new RegExp(escapeRegExp(model.modelId)));
  }
});

test("AGENTS captures the repository contract anchors", () => {
  const agents = readText("AGENTS.md");

  assertMatchesAll(agents, [
    new RegExp(escapeRegExp(CONTRACT_METADATA.packageName)),
    /src\/cli\.ts/,
    /~\/\.codex\/config\.toml/,
    /\.codex\/config\.toml/,
    new RegExp(escapeRegExp(`model_provider = "${GONKAGATE_PROVIDER_ID}"`)),
    /wire_api = "responses"/,
    /auth\.json/,
    /installer is implemented/i,
    new RegExp(escapeRegExp(CONTRACT_METADATA.verifiedCodex.minVersion)),
  ]);
});

test("implementation docs capture current install and troubleshooting anchors", () => {
  const howItWorks = readText("docs/how-it-works.md");
  const troubleshooting = readText("docs/troubleshooting.md");

  assertMatchesAll(howItWorks, [
    new RegExp(escapeRegExp(CONTRACT_METADATA.publicEntrypoint)),
    new RegExp(escapeRegExp(CONTRACT_METADATA.verifiedCodex.minVersion)),
    /wire_api = "responses"/,
    /model_catalog_json/,
  ]);

  assertMatchesAll(troubleshooting, [
    new RegExp(escapeRegExp(CONTRACT_METADATA.verifiedCodex.minVersion)),
    /openai_base_url/,
    /projects\."\s*<abs-path>\s*"\.trust_level = "trusted"|projects\."\<abs-path\>"\.trust_level = "trusted"/,
    /wire_api = "responses"/,
    /\.codex\/config\.toml/,
  ]);
});

test("security docs capture the secret-handling constraints", () => {
  const security = readText("docs/security.md");

  assertMatchesAll(security, [
    /auth\.json/,
    /owner-only permissions/i,
    /~\/\.codex/,
    /\.git\/info\/exclude/,
  ]);
});

test("mirrored skill assets stay aligned across .agents and .claude", () => {
  for (const skillDirectory of mirroredSkillDirectories) {
    assertMirroredSkillDirectory(skillDirectory);
  }
});

test("coding-prompt-normalizer stays adapted to codex-setup", () => {
  const skill = readText(".agents/skills/coding-prompt-normalizer/SKILL.md");
  const repoRouting = readText(
    ".agents/skills/coding-prompt-normalizer/references/repo-context-routing.md",
  );
  const normalization = readText(
    ".agents/skills/coding-prompt-normalizer/references/input-normalization.md",
  );

  assertMatchesAll(skill, [
    /codex-setup/,
    /~\/\.codex\/config\.toml/,
    /installer runtime under `src\/`/,
    new RegExp(escapeRegExp(CONTRACT_METADATA.publicEntrypoint)),
  ]);
  assertMatchesAll(repoRouting, [
    /implemented TypeScript\/Node installer/i,
    /src\/install\//,
    new RegExp(escapeRegExp(CONTRACT_METADATA.publicEntrypoint)),
  ]);
  assertMatchesAll(normalization, [
    /wire_api = "responses"/,
    /auth\.json/,
    /test\/scaffold\.test\.ts/,
  ]);
});

test("codex-compatibility-audit targets latest Codex CLI contracts", () => {
  const agentSkill = readText(
    ".agents/skills/codex-compatibility-audit/SKILL.md",
  );
  const reportTemplate = readText(
    ".agents/skills/codex-compatibility-audit/references/report-template.md",
  );

  assertMatchesAll(agentSkill, [
    /@openai\/codex/,
    /latest stable/i,
    /developers\.openai\.com\/codex\/config-reference\//,
    /developers\.openai\.com\/codex\/config-schema\.json/,
    /api\.github\.com\/repos\/openai\/codex\/releases\/latest/,
    /projects\."\<path\>"\.trust_level/,
  ]);
  assert.doesNotMatch(agentSkill, /openclaw/i);
  assert.match(reportTemplate, /Prerelease Watchlist/);
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
