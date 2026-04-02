---
name: codex-compatibility-audit
description: "Read-only compatibility audit between `codex-setup` and the latest stable `@openai/codex` CLI release, with optional prerelease watch channels. Use whenever the task is to decide whether this repository still matches current Codex config, custom-provider, trust, auth, model-catalog, or command contracts, even if the user only asks 'is this still compatible?' or 'did Codex upstream break us?'."
---

# Codex Compatibility Audit

## Purpose

Use this skill to answer one practical question:
is `codex-setup` still compatible with the current stable upstream Codex CLI
contract or not?

This is a read-only compatibility gate. The job is to compare official
upstream Codex behavior against the assumptions encoded in this repository and
return a clear verdict, not to design or apply a migration.

## Scope

Cover the repository's current and planned Codex-facing contract, especially:

- config location and scope assumptions for `~/.codex/config.toml` and
  `.codex/config.toml`
- trust gating via `projects."<path>".trust_level`
- custom-provider wiring through `model_provider` and
  `model_providers.<id>.*`
- protocol expectations such as `wire_api = "responses"`
- auth strategy assumptions around `model_providers.<id>.auth`, `env_key`,
  `requires_openai_auth`, and credential storage behavior
- `model_catalog_json` expectations and model-discovery assumptions
- whether `openai_base_url` is still a weaker fit than a dedicated custom
  provider for this product
- user-visible CLI or workflow assumptions that this repo documents, such as
  `codex`, `codex login`, `codex exec`, `/status`, and `/debug-config`
- newly required settings, renamed fields, removed flags, or release-level
  behavior changes that would make the documented GonkaGate Codex plan stale or
  unsafe

Default compatibility target:

- latest stable `@openai/codex` release from the npm `latest` dist-tag

Secondary watch target:

- newer prerelease channels such as `alpha` or `beta`, but only as an
  early-warning watchlist unless the user explicitly asks for prerelease
  compatibility

## Boundaries

Do not:

- modify repository code or docs
- broaden product scope beyond the current GonkaGate Codex contract
- propose `.env` writing, shell profile mutation, direct `auth.json` mutation,
  or `openai_base_url` as the default integration path unless the user
  explicitly asks for a product change
- use secondary summaries when primary sources are available
- treat prerelease drift as a stable compatibility failure unless the user
  explicitly asked to audit prereleases
- turn the audit into an auto-remediation or full migration plan

## Primary-Source Discipline

Use primary sources only:

- npm registry metadata for `@openai/codex`
- official GitHub releases and release notes for `openai/codex`
- official Codex docs, especially:
  - `https://developers.openai.com/codex/config-reference/`
  - `https://developers.openai.com/codex/config-advanced/`
  - `https://developers.openai.com/codex/cli/reference/`
  - `https://developers.openai.com/codex/config-schema.json`
- official tagged upstream source or tests at the matching stable tag
- shipped package behavior or CLI help for the same stable version

Prefer this discovery order:

1. `npm view @openai/codex version dist-tags repository.url homepage --json`
2. `https://api.github.com/repos/openai/codex/releases/latest`
3. official release notes for the exact stable tag
4. official docs and config schema
5. tagged upstream source or tests when docs are incomplete
6. isolated CLI help or read-only inspection when source and docs are still
   insufficient

Useful starting points:

- `npm view @openai/codex version dist-tags repository.url homepage --json`
- `curl -fsSL https://api.github.com/repos/openai/codex/releases/latest`
- `npx -y @openai/codex@<version> --help`
- `npx -y @openai/codex@<version> exec --help`
- `npx -y @openai/codex@<version> login --help`
- `npx -y @openai/codex@<version> features --help`

If official docs and the tagged release disagree, trust the tagged release,
schema, or shipped stable artifact and call out documentation drift explicitly.

## Safe Read-Only Execution

Keep the audit read-only.

- Prefer release notes, docs, schema, CLI help, source, and tests over running
  stateful commands.
- Never run upstream Codex commands against the user's real `~/.codex`.
- If you need CLI help or read-only behavior inspection, isolate it in a
  disposable temp directory and point `HOME`, `CODEX_HOME`, and any other
  relevant config roots at temp paths.
- Do not run login flows or commands that mutate real state.
- Treat isolated local execution as a last resort after docs, schema, release
  notes, and tagged source.

## Repository Surfaces To Compare

Start from the current repository contract surfaces:

- `README.md`
- `docs/how-it-works.md`
- `docs/security.md`
- `docs/troubleshooting.md`
- `bin/gonkagate-codex.js`
- `package.json`
- `test/scaffold.test.ts`

Inspect local skills when they encode product assumptions that affect the audit,
especially:

- `.claude/skills/coding-prompt-normalizer/`
- `.agents/skills/coding-prompt-normalizer/`
- this compatibility-audit skill itself, if its assumptions look stale

If the repository later adds implementation modules, inspect those too instead
of stopping at docs. In particular, compare any future surfaces under:

- `src/`
- `test/`
- config-writing modules
- provider/auth helpers
- model-catalog generation
- runtime verification flows

## Upstream Evidence To Gather

For the target stable release, gather evidence for:

- the exact stable version, release tag, and publish date
- whether npm `latest` and GitHub `latest release` agree
- whether newer prerelease channels exist and whether they signal upcoming
  contract drift
- where Codex loads user config from and how project `.codex/config.toml`
  overrides are trusted or ignored
- the official shape of `model_provider`, `model_providers.<id>.*`,
  `openai_base_url`, `model_catalog_json`, and `projects."<path>".trust_level`
- whether custom providers still require or default to `wire_api = "responses"`
- whether provider auth surfaces changed, especially around
  `model_providers.<id>.auth`, bearer-token refresh, `env_key`, or
  `requires_openai_auth`
- whether `auth.json` remains an internal credentials store detail rather than
  a stable integration contract
- whether Codex added or removed CLI surfaces relevant to this repository's
  documented flow
- whether release notes mention changes to custom providers, project-local
  `.codex` behavior, dynamic auth tokens, trust gating, or model catalogs
- any newly required settings, schema migrations, or structural requirements
  that this repository does not currently satisfy

When searching source or docs, start with these literals:

- `~/.codex/config.toml`
- `.codex/config.toml`
- `projects.<path>.trust_level`
- `model_provider`
- `model_providers`
- `wire_api`
- `responses`
- `model_catalog_json`
- `openai_base_url`
- `auth.json`
- `check_for_update_on_startup`
- `custom providers`
- `bearer token`
- `auth`
- `codex exec`
- `codex login`

## Workflow

1. Identify the audit target.
   - Determine the latest stable `@openai/codex` release from npm metadata.
   - Confirm the matching GitHub release tag and publish date.
   - Note any newer prerelease channels from dist-tags, but keep them separate
     from the stable compatibility verdict unless the user asked for them.
2. Capture the upstream contract before judging compatibility.
   - Read official release notes for the exact stable version.
   - Read official config docs, CLI docs, and config schema.
   - Read tagged source or tests when docs are vague, incomplete, or missing
     exact field or behavior details.
   - Use isolated CLI help only when docs and source still leave an important
     ambiguity.
3. Map the repository's assumptions.
   - Read `README.md` and `docs/` first.
   - Then inspect `bin/gonkagate-codex.js`, `package.json`, tests, and any
     implementation surfaces that exist.
   - Keep current scaffold truthfulness separate from the planned future
     product contract.
4. Compare the critical seams one by one.
   - `Config location and trust`
     Compare upstream config path and trust rules against the repo's
     `~/.codex/config.toml`, `.codex/config.toml`, and
     `projects."<path>".trust_level` assumptions.
   - `Provider wiring`
     Compare upstream provider config expectations against the repo's planned
     `model_provider`, `model_providers.<id>.*`, `wire_api`, and
     `supports_websockets` usage.
   - `Auth and secret handling`
     Compare upstream auth surfaces against the repo's planned use of
     command-backed auth, user-scope secret storage, and refusal to mutate
     `auth.json`.
   - `Model catalog and discovery`
     Compare upstream model-catalog behavior against the repo's curated
     `model_catalog_json` strategy.
   - `Workflow and command surfaces`
     Compare upstream CLI surfaces and documented workflows against what this
     repo promises users today.
   - `Recent release drift`
     Compare the latest stable release notes, and optionally newer prerelease
     signals, against the repo's custom-provider plan.
5. Classify the evidence.
   - Label each material point as:
     `confirmed upstream change`, `confirmed still compatible`,
     `confirmed repo-overstatement`, or `inferred risk`.
   - Keep observed upstream facts separate from your interpretation of impact.
6. Decide the verdict.
   - `compatible`
     No confirmed upstream stable change breaks the repository's current or
     planned Codex contract.
   - `compatible with caveats`
     No confirmed stable break yet, but there is meaningful ambiguity,
     documentation drift, prerelease warning, or repository overstatement that
     weakens confidence.
   - `incompatible`
     A confirmed upstream stable change conflicts with a required repository
     assumption or makes the documented GonkaGate Codex plan stale or unsafe.
7. Name the minimum follow-up.
   - Point to the exact repo surfaces that would need attention.
   - Keep this as `recommended fix areas`, not a redesign.

## Reasoning Discipline

- Separate confirmed upstream changes from inferred risk.
- Base the main verdict on the latest stable release, not on prereleases.
- Use prerelease channels only as an explicit watchlist unless the user asked
  for prerelease compatibility.
- If the repo docs are still compatible with upstream but the placeholder
  implementation is misleading, call that a repository truthfulness issue, not
  an upstream break.
- If the upstream docs are vague but the schema, release tag, or shipped stable
  behavior is clear, cite the shipped behavior and call out doc drift.
- Treat provider auth, `wire_api`, trust gating, and config-layer behavior as
  high-sensitivity by default.
- Do not infer support for out-of-scope product changes that this repository
  explicitly rejects.

## Output

Load `references/report-template.md` before writing the final answer.

The report should:

- cite the exact stable version audited and its release date
- link the primary sources used
- separate confirmed upstream changes from inferred risk
- separate stable-verdict impact from prerelease watchlist signals
- point to the exact repository surfaces that would break or need clarification
- include a short `recommended fix areas` section only when the verdict is
  `compatible with caveats` or `incompatible`

Keep the output short, decisive, and evidence-backed.
