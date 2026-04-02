# AGENTS.md

## What This Repository Is

`codex-setup` is the public open-source onboarding repository for GonkaGate
API users who want to configure local Codex CLI to use GonkaGate as a custom
provider without manually editing `~/.codex/config.toml`, exporting secrets
through shell profiles, or understanding Codex provider internals by hand.

The core idea of this repo is:

- provide one short public entrypoint
- reduce Codex onboarding to a single npm command
- keep secrets in user scope rather than in the repository
- avoid `.env` files and shell profile mutation
- avoid forcing users to understand Codex custom-provider wiring manually

Recommended public flow:

```bash
npx @gonkagate/codex-setup
```

Current honest state:

- the installer is implemented for Codex CLI
- the current bin surface is `gonkagate-codex`
- the runtime lives under `src/` and is compiled to `dist/`
- the current curated model registry contains one validated Codex model:
  `gpt-5.4`
- the current verified upstream baseline is stable `@openai/codex` `0.118.0`
  as of April 2, 2026

If the public flow, package name, implementation status, supported models, or
verified Codex baseline changes, this file must be updated immediately so it
stays truthful.

## Product Goal

The intended happy path is:

1. user runs `npx @gonkagate/codex-setup`
2. installer prompts for a hidden GonkaGate `gp-...` key
3. installer offers a curated model picker
4. installer asks for `user` or `local` scope
5. installer writes the necessary Codex configuration layers
6. user returns to plain `codex`

For `local` scope, the secret still lives only under `~/.codex/...`, while the
repo-local `.codex/config.toml` contains only activation settings.

## Fixed Product Invariants

These decisions are part of the repo contract. Changing them is not a small
refactor; it is a product change.

- the npm package is `@gonkagate/codex-setup`
- the intended public npm entrypoint is `npx @gonkagate/codex-setup`
- Codex user config lives in `~/.codex/config.toml`
- project overrides live in `.codex/config.toml`
- project-layer config is only loaded for trusted projects
- the preferred provider shape is `model_provider = "gonkagate"` with
  `[model_providers.gonkagate]`
- the provider must be compatible with Codex `responses` semantics and
  streaming
- `wire_api = "responses"` is the intended provider protocol
- `openai_base_url` is not the preferred GonkaGate integration path
- the preferred auth path is command-backed bearer-token retrieval through
  `model_providers.<id>.auth`
- the installer should not write directly to `auth.json`
- secrets stay in user scope under `~/.codex/...`
- repo-local `.codex/config.toml` should contain only local activation settings
- `projects."<abs-path>".trust_level = "trusted"` may need to be set in user
  config when local scope is selected
- model selection should come from a curated registry and `model_catalog_json`,
  not from raw `/v1/models` discovery as the main UX
- v1 targets Codex CLI first
- Codex Desktop App support is best-effort, not a guaranteed contract
- shell profile mutation is out of scope
- arbitrary custom base URLs are out of scope for v1
- arbitrary custom model IDs are out of scope for v1

## Security Invariants

- never print the GonkaGate `gp-...` key
- never take the secret through a plain CLI flag
- never store the secret in repository-local files
- keep secret-bearing files under `~/.codex/...` with owner-only permissions
- preserve unrelated Codex config when editing user config
- create backups before replacing existing secret-bearing config
- if `<repo>/.codex/config.toml` is already tracked, the installer should not
  silently mutate it
- if repo-local config is used and is not tracked, it should be kept local by
  default, for example via `.git/info/exclude`

## Current Repository Truth

These are implementation facts today, not future plans:

- `src/cli.ts` is the main runtime entrypoint
- `bin/gonkagate-codex.js` is a thin wrapper over `dist/cli.js`
- the installer currently writes:
  - `~/.codex/config.toml`
  - `~/.codex/gonkagate/token`
  - `~/.codex/bin/gonkagate-token`
  - `~/.codex/model-catalogs/gonkagate.json`
  - `<project-root>/.codex/config.toml` for local scope only
- the current curated model catalog is derived from upstream Codex model
  metadata and currently includes `gpt-5.4`
- `test/install-use-case.test.ts` covers real file-writing behavior on temp
  filesystems and git repos
- `test/scaffold.test.ts` protects the repository contract around docs,
  package metadata, and local mirrored skills
- local support assets are mirrored under `.claude/skills/` and
  `.agents/skills/`
- when mirrored skill assets change, both copies should stay aligned unless
  there is a deliberate reason not to

Do not describe desktop-app support, arbitrary model ids, or arbitrary gateway
URLs as implemented behavior unless the code actually supports them.

## What The Repo Does And Does Not Do

This repo currently does:

- install and configure Codex CLI for GonkaGate
- write `~/.codex/config.toml`
- write `<project-root>/.codex/config.toml` for local scope
- generate `model_catalog_json` from a curated bundled registry
- create a helper auth command under `~/.codex/bin/`
- preserve unrelated Codex config via TOML merge
- create backups before replacing managed config or token files
- keep local project config out of git by default when it is untracked
- provide CI, release-please, npm publish scaffolding, and local engineering
  skills

This repo currently does not do:

- support Codex Desktop App as a first-class onboarding target
- accept arbitrary custom base URLs
- accept arbitrary custom model IDs
- mutate shell profiles
- mutate `auth.json` directly
- verify live Codex sessions automatically after installation beyond the
  on-screen `/status` and `/debug-config` guidance

## Repository Structure

```text
.
├── AGENTS.md
├── README.md
├── CHANGELOG.md
├── LICENSE
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.build.json
├── .github/workflows/
├── bin/
│   └── gonkagate-codex.js
├── docs/
│   ├── how-it-works.md
│   ├── security.md
│   └── troubleshooting.md
├── scripts/
│   ├── extract-model-catalog.mjs
│   └── run-tests.mjs
├── src/
│   ├── cli.ts
│   ├── constants/
│   └── install/
├── test/
│   ├── cli.test.ts
│   ├── install-use-case.test.ts
│   ├── scaffold.test.ts
│   └── validate-api-key.test.ts
├── .claude/skills/
└── .agents/skills/
```

If runtime surfaces or product scope change later, this section should be
updated so it remains accurate.

## Important Surfaces

### `README.md`

Primary public product summary. Keep package name, `npx` entrypoint, supported
models, current Codex baseline, and implementation status truthful.

### `docs/how-it-works.md`

Repository-level contract for installer architecture and scope behavior.

### `docs/security.md`

Security and secret-handling contract. Any change to auth flow, secret storage,
repo-local scope, or backup behavior should be reflected there.

### `src/cli.ts`

The main installer flow and public CLI behavior.

### `src/install/`

Runtime implementation for prompts, TOML config merge, git safety, helper
command generation, and managed file writes.

### `test/install-use-case.test.ts`

The main runtime behavior proof slice for config writing, local scope, tracked
project config fallback, and backups.

### `.claude/skills/` and `.agents/skills/`

Repo-local support material for prompt normalization, TypeScript work,
verification, and compatibility audits. Mirror updates across both trees when
the skill is intentionally shared.

## Change Discipline

When behavior changes:

- update `AGENTS.md`
- update `README.md`
- update relevant files in `docs/`
- update `CHANGELOG.md` when the change is meaningful to users or contributors
- update `test/scaffold.test.ts` if the repository contract changed
- keep mirrored `.claude` and `.agents` skills aligned when applicable

When upstream Codex behavior changes:

- prefer the official Codex docs, config schema, GitHub releases, npm metadata,
  and tagged source as primary sources
- use the local `codex-compatibility-audit` skill to judge whether the repo
  contract is still compatible with the latest stable Codex CLI release

## Validation

Current local validation baseline:

```bash
npm run ci
```

That command should stay green before treating installer, contract, or doc
changes as ready.
