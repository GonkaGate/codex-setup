import assert from "node:assert/strict";
import test from "node:test";
import { CONTRACT_METADATA } from "../contract-metadata.js";
import {
  assertMatchesAll,
  assertMirroredSkillDirectory,
  escapeRegExp,
  readText,
} from "./contract-helpers.js";

const mirroredSkillDirectories = [
  "codex-compatibility-audit",
  "coding-prompt-normalizer",
  "technical-design-review",
  "typescript-coder",
  "verification-before-completion",
] as const;

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
    /test\/docs-contract\.test\.ts/,
  ]);
  assertMatchesAll(repoRouting, [
    /implemented TypeScript\/Node installer/i,
    /src\/install\//,
    new RegExp(escapeRegExp(CONTRACT_METADATA.publicEntrypoint)),
    /test\/skills-contract\.test\.ts/,
  ]);
  assertMatchesAll(normalization, [
    /wire_api = "responses"/,
    /auth\.json/,
    /test\/docs-contract\.test\.ts/,
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
    /test\/docs-contract\.test\.ts/,
  ]);
  assert.doesNotMatch(agentSkill, /openclaw/i);
  assert.match(reportTemplate, /Prerelease Watchlist/);
});
