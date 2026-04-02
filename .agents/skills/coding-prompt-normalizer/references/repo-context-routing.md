# Repo Context Routing

Use this file to choose only the repository context that materially changes the
generated prompt.

Do not dump the whole repo summary into the output. Pull only the relevant
points.

## Always-True Defaults

- The downstream agent already works inside this repository.
- Do not explain how to inspect files, edit code, create folders, or run
  ordinary repo commands.
- `codex-setup` is an implemented TypeScript/Node installer for using
  GonkaGate with Codex CLI.
- Canonical surfaces today are `src/`, `bin/gonkagate-codex.js`, `README.md`,
  `docs/`, `test/scaffold.test.ts`, `scripts/run-tests.mjs`,
  `.github/workflows/`, `package.json`, `release-please-config.json`,
  `.claude/skills/`, and `.agents/skills/`.
- `README.md` and the files under `docs/` are the main current contract
  surfaces for product and security behavior.
- Avoid generic tool instructions like "inspect the repo" unless the request
  explicitly needs them.

## Use Repo Constraints Selectively

Include a repository constraint only when it changes the task:

- the target public UX is `npx @gonkagate/codex-setup`, and the current CLI
  implements that installer flow
- user config lives in `~/.codex/config.toml`
- project overrides live in `.codex/config.toml`
- the project layer is only loaded for trusted projects
- the preferred provider shape is `model_provider = "gonkagate"` with
  `[model_providers.gonkagate]`
- the provider must use `wire_api = "responses"`
- the preferred auth path is command-backed bearer token retrieval through
  provider `auth`
- secrets should stay under `~/.codex/...`, not inside the repository
- `model_catalog_json` should come from a curated registry rather than raw
  `/v1/models` discovery
- `openai_base_url` is not the preferred GonkaGate integration path
- the installer should not write directly to `auth.json`
- v1 targets Codex CLI first; desktop app behavior is best-effort
- if public behavior changes, `README.md`, `docs/`, and `CHANGELOG.md` may need
  updates to stay truthful

## Routing By Task Signal

### CLI, Package, Release, Public UX

Use when the request mentions CLI args, help output, subcommands, package
entrypoints, release automation, publish flow, or user-facing onboarding.

Useful context:

- `bin/gonkagate-codex.js`
- `package.json`
- `.github/workflows/ci.yml`
- `.github/workflows/release-please.yml`
- `.github/workflows/publish.yml`
- `README.md`
- `CHANGELOG.md`

### Provider Architecture, Config Scope, Auth, Model Catalog

Use when the request mentions custom providers, `~/.codex/config.toml`,
`.codex/config.toml`, trust level, `wire_api = "responses"`, auth command
strategy, model catalog generation, or security boundaries.

Useful context:

- `README.md`
- `docs/how-it-works.md`
- `docs/security.md`
- `docs/troubleshooting.md`
- `test/scaffold.test.ts`

Relevant reminders:

- the installer runtime already exists under `src/install/`
- config and provider rules live in both docs and runtime code
- prompts should inspect existing modules before proposing new seams

### Docs, Product Messaging, Truthfulness

Use when the task is mainly about repo documentation, public flow description,
security wording, troubleshooting, or changelog accuracy.

Useful context:

- `README.md`
- `docs/how-it-works.md`
- `docs/security.md`
- `docs/troubleshooting.md`
- `CHANGELOG.md`
- `bin/gonkagate-codex.js`

Relevant reminders:

- docs should distinguish implemented behavior from product recommendations and
  non-goals
- product-surface changes are not just copy edits; they may imply architecture
  or implementation work

### Tests, Tooling, Scaffold Integrity

Use when the request mentions test coverage, repository contract checks, CI,
formatting, or package quality.

Useful context:

- `test/scaffold.test.ts`
- `scripts/run-tests.mjs`
- `package.json`
- `.github/workflows/ci.yml`
- `.nvmrc`

Relevant reminders:

- repository tests currently protect installer and doc-contract expectations
- `npm run ci` is the primary local verification command

### Skills, Prompts, Agent Workflow

Use when the request is about local skills, prompt rewriting, agent
instructions, or repo-local workflow assets.

Useful context:

- `.claude/skills/`
- `.agents/skills/`
- the specific local skill folder touched by the request
- `test/scaffold.test.ts` when the repo should enforce the new expectation

Relevant reminders:

- many skill assets are mirrored under both `.claude` and `.agents`
- prompt assets should stay aligned with the actual current repo state
- if a skill is repo-specific, examples and literals should point to Codex and
  current repo surfaces rather than stale OpenClaw paths

## Output Discipline

When you include repo context in the final prompt:

- prefer short bullets or short paragraphs
- name the most relevant docs or code areas first
- keep background only if it changes the downstream agent's first decisions
- avoid repeating repo facts unless they change the downstream agent's first
  decisions
