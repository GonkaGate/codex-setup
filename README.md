# @gonkagate/codex-setup

Set up Codex CLI to use GonkaGate as a custom provider in one `npx` command,
without shell exports, `.env` files, manual edits to `~/.codex/config.toml`,
or direct exposure to Codex provider internals.

## Usage

```bash
npx @gonkagate/codex-setup
```

What the installer does today:

- checks that `codex` is available and that the local Codex CLI is at least
  `0.118.0`
- prompts for a hidden GonkaGate `gp-...` key
- fetches `GET https://api.gonkagate.com/v1/models` with that key
- uses the live `/v1/models` response as the model source of truth
- asks whether GonkaGate should be activated in `user` or `local` scope
- keeps the secret, helper command, and live model catalog under
  `~/.codex/...` by default, or under `CODEX_HOME` when that env var is set
- writes or updates the necessary Codex config layers
- creates backups before replacing existing managed files

## Scope Model

`user` scope:

- writes provider config, model activation, and `model_catalog_json` to
  `~/.codex/config.toml`
- keeps the token file, helper command, and live catalog under `~/.codex/...`

`local` scope:

- still keeps the secret, helper command, and live catalog under `~/.codex/...`
- writes only activation settings to `<project-root>/.codex/config.toml`
- writes the provider definition and
  `projects."<abs-path>".trust_level = "trusted"` to user config
- refuses to mutate `<project-root>/.codex/config.toml` when that file is
  already tracked by git; the installer offers `user` scope or cancel instead
- adds `.codex/config.toml` and `.codex/config.toml.backup-*` to
  `.git/info/exclude` when the file is local and untracked

## Codex Configuration Shape

`user` scope produces the equivalent of:

```toml
model_provider = "gonkagate"
model = "model-id-returned-by-v1-models"
model_catalog_json = "/Users/you/.codex/model-catalogs/gonkagate.json"

[model_providers.gonkagate]
name = "GonkaGate"
base_url = "https://api.gonkagate.com/v1"
wire_api = "responses"
supports_websockets = false
auth = { command = "/Users/you/.codex/bin/gonkagate-token", timeout_ms = 5000, refresh_interval_ms = 300000, cwd = "/Users/you/.codex" }
```

For `local` scope, the user config keeps the provider definition and project
trust entry, while `<project-root>/.codex/config.toml` activates:

```toml
model_provider = "gonkagate"
model = "model-id-returned-by-v1-models"
model_catalog_json = "/Users/you/.codex/model-catalogs/gonkagate.json"
```

## Design Decisions

- Codex user config lives in `~/.codex/config.toml`.
- Project overrides live in `.codex/config.toml` and are loaded only for
  trusted projects.
- GonkaGate uses a custom `model_provider`, not `openai_base_url`.
- The provider must speak Codex `responses` wire semantics, including
  streaming.
- The auth path is command-backed bearer token retrieval through
  `model_providers.<id>.auth`.
- The installer never writes directly to `auth.json`.
- Model selection comes from `GET https://api.gonkagate.com/v1/models` with
  the user's API key.
- The installer writes `model_catalog_json` from the live model IDs plus
  generic Codex capability defaults, not from a checked-in allowlist.
- v1 targets Codex CLI first. Desktop app behavior is best-effort rather than
  a product promise.

## Development

```bash
npm install
npm run ci
```

Useful commands:

- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm run format`
- `npm run package:check`

## Docs

- [How it works](docs/how-it-works.md)
- [Security notes](docs/security.md)
- [Troubleshooting](docs/troubleshooting.md)

## Current Verification Baseline

The current implementation was verified against the stable `@openai/codex`
release `0.118.0` on April 2, 2026. If upstream Codex changes provider auth,
trust handling, or `model_catalog_json`, this repository contract should be
re-audited before changing the installer behavior.
