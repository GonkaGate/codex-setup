import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

function readText(relativePath: string) {
  return readFileSync(resolve(repoRoot, relativePath), "utf8");
}

test("required repository files exist", () => {
  const requiredFiles = [
    "AGENTS.md",
    ".agents/skills/codex-compatibility-audit/SKILL.md",
    ".claude/skills/codex-compatibility-audit/SKILL.md",
    ".agents/skills/technical-design-review/SKILL.md",
    ".agents/skills/typescript-coder/SKILL.md",
    ".agents/skills/verification-before-completion/SKILL.md",
    ".editorconfig",
    ".claude/skills/technical-design-review/SKILL.md",
    ".claude/skills/typescript-coder/SKILL.md",
    ".claude/skills/verification-before-completion/SKILL.md",
    ".github/workflows/ci.yml",
    ".github/workflows/publish.yml",
    ".github/workflows/release-please.yml",
    ".nvmrc",
    "README.md",
    "CHANGELOG.md",
    "docs/how-it-works.md",
    "docs/security.md",
    "docs/troubleshooting.md",
    "bin/gonkagate-codex.js",
    "package.json",
    "release-please-config.json",
    "scripts/extract-model-catalog.mjs",
    "scripts/run-tests.mjs",
    "src/cli.ts",
    "src/install/install-use-case.ts",
    "src/install/codex-config.ts",
    "src/constants/model-catalog.ts",
    "test/install-use-case.test.ts",
  ];

  for (const relativePath of requiredFiles) {
    assert.ok(
      existsSync(resolve(repoRoot, relativePath)),
      `Expected ${relativePath} to exist.`,
    );
  }
});

test("package metadata matches the installer contract", () => {
  const packageJson = JSON.parse(readText("package.json")) as {
    name: string;
    type: string;
    bin: Record<string, string>;
    scripts: Record<string, string>;
  };

  assert.equal(packageJson.name, "@gonkagate/codex-setup");
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.bin["gonkagate-codex"], "bin/gonkagate-codex.js");
  assert.match(packageJson.scripts.test, /npm run build/);
  assert.match(packageJson.scripts.ci, /npm run typecheck/);
  assert.match(packageJson.scripts.ci, /npm run test/);
  assert.match(packageJson.scripts.ci, /npm run package:check/);
});

test("README captures the current Codex installer decisions", () => {
  const readme = readText("README.md");

  assert.match(readme, /~\/\.codex\/config\.toml/);
  assert.match(readme, /\.codex\/config\.toml/);
  assert.match(readme, /trusted projects?/i);
  assert.match(readme, /wire_api = "responses"/);
  assert.match(readme, /model_catalog_json/);
  assert.match(readme, /command-backed bearer token/i);
  assert.match(readme, /gpt-5\.4/);
  assert.match(readme, /0\.118\.0/);
});

test("AGENTS captures the repository contract", () => {
  const agents = readText("AGENTS.md");

  assert.match(agents, /@gonkagate\/codex-setup/);
  assert.match(agents, /src\/cli\.ts/);
  assert.match(agents, /~\/\.codex\/config\.toml/);
  assert.match(agents, /\.codex\/config\.toml/);
  assert.match(agents, /wire_api = "responses"/);
  assert.match(agents, /auth\.json/);
  assert.match(agents, /installer is implemented/i);
  assert.match(agents, /0\.118\.0/);
});

test("coding-prompt-normalizer is adapted to codex-setup", () => {
  const skill = readText(".claude/skills/coding-prompt-normalizer/SKILL.md");
  const repoRouting = readText(
    ".claude/skills/coding-prompt-normalizer/references/repo-context-routing.md",
  );
  const normalization = readText(
    ".claude/skills/coding-prompt-normalizer/references/input-normalization.md",
  );

  assert.match(skill, /codex-setup/);
  assert.match(skill, /~\/\.codex\/config\.toml/);
  assert.match(skill, /installer runtime under `src\/`/);
  assert.doesNotMatch(skill, /there is currently no `src\/`/);
  assert.doesNotMatch(skill, /openclaw-setup/);
  assert.doesNotMatch(skill, /~\/\.openclaw\/openclaw\.json/);

  assert.match(repoRouting, /implemented TypeScript\/Node installer/i);
  assert.match(repoRouting, /src\/install\//);
  assert.match(repoRouting, /npx @gonkagate\/codex/);
  assert.doesNotMatch(repoRouting, /npx @gonkagate\/openclaw/);

  assert.match(normalization, /wire_api = "responses"/);
  assert.match(normalization, /auth\.json/);
  assert.doesNotMatch(normalization, /openclaw setup/);
});

test("codex-compatibility-audit targets latest Codex CLI contracts", () => {
  const agentSkill = readText(
    ".agents/skills/codex-compatibility-audit/SKILL.md",
  );
  const claudeSkill = readText(
    ".claude/skills/codex-compatibility-audit/SKILL.md",
  );
  const reportTemplate = readText(
    ".agents/skills/codex-compatibility-audit/references/report-template.md",
  );

  assert.equal(claudeSkill, agentSkill);
  assert.match(agentSkill, /@openai\/codex/);
  assert.match(agentSkill, /latest stable/i);
  assert.match(
    agentSkill,
    /developers\.openai\.com\/codex\/config-reference\//,
  );
  assert.match(
    agentSkill,
    /developers\.openai\.com\/codex\/config-schema\.json/,
  );
  assert.match(
    agentSkill,
    /api\.github\.com\/repos\/openai\/codex\/releases\/latest/,
  );
  assert.match(agentSkill, /projects\."\<path\>"\.trust_level/);
  assert.doesNotMatch(agentSkill, /OpenClaw|openclaw/i);
  assert.match(reportTemplate, /Prerelease Watchlist/);
});

test("security docs capture the secret-handling constraints", () => {
  const security = readText("docs/security.md");

  assert.match(security, /auth\.json/);
  assert.match(security, /owner-only permissions/i);
  assert.match(security, /~\/\.codex/);
  assert.match(security, /\.git\/info\/exclude/);
});

test("CLI wrapper exposes the implemented installer entrypoint", () => {
  const binPath = resolve(repoRoot, "bin/gonkagate-codex.js");
  const helpResult = spawnSync(process.execPath, [binPath, "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(helpResult.status, 0);
  assert.match(helpResult.stdout, /GonkaGate Codex CLI installer/i);
  assert.match(helpResult.stdout, /--scope <scope>/);
  assert.match(helpResult.stdout, /--model <model-key>/);

  const versionResult = spawnSync(process.execPath, [binPath, "--version"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  assert.equal(versionResult.status, 0);
  assert.match(versionResult.stdout, /0\.1\.0/);
});
