# How It Works

`@gonkagate/codex-setup` is a small onboarding CLI for Codex CLI that writes
the minimum safe configuration needed to route Codex requests through
GonkaGate as a custom provider.

The primary UX is:

```bash
npx @gonkagate/codex-setup
```

## Install Flow

1. Check that `codex` is available and that the installed Codex CLI is at
   least `0.118.0`.
2. Prompt for a GonkaGate `gp-...` key through a hidden input.
3. Choose a model from the curated registry bundled with this package.
   Today that registry contains one validated entry: `gpt-5.4`.
4. Choose `user` or `local` scope.
5. Save the secret only under `~/.codex/...` (or `CODEX_HOME` when that env
   var is set), never inside the repository.
6. Write or update the helper token command under `~/.codex/bin/`.
7. Write or update the curated `model_catalog_json` under
   `~/.codex/model-catalogs/gonkagate.json`.
8. Write or update the user-level provider definition in
   `~/.codex/config.toml`.
9. When `local` scope is chosen:
   - write only activation settings to `<project-root>/.codex/config.toml`
   - set `projects."<abs-path>".trust_level = "trusted"` in user config
   - keep the local config file out of git by default through `.git/info/exclude`
10. Create backups before replacing existing managed config or token files.
11. Tell the user to verify with `codex`, then `/status`, and fall back to
    `/debug-config` if needed.

## Why A Custom Provider

The installer deliberately uses:

- `model_provider = "gonkagate"`
- `[model_providers.gonkagate]`
- `wire_api = "responses"`

It does not treat `openai_base_url` as the main integration path. That key
reconfigures the built-in OpenAI provider, while GonkaGate needs its own
provider definition and auth command.

## Why Command-Backed Auth

The installer uses command-backed bearer-token auth through
`model_providers.<id>.auth`.

That gives the product the intended UX:

- the user enters a `gp-...` key once
- the installer stores it in a private file under `~/.codex/...`
- Codex reads the bearer token on demand through a helper command
- no shell exports or `.env` files are required

The implementation intentionally does not write directly to Codex auth storage
internals such as `auth.json`.

## Why Curated Models

The model picker does not depend on runtime `/v1/models` discovery as the main
UX.

Instead, the installer ships curated Codex model metadata and writes a local
`model_catalog_json` file. That keeps the onboarding surface stable even if the
gateway model list changes or exposes ids that should not be part of the public
setup experience.

## Scope Model

`user` scope:

- write provider config, helper command, token storage, and model catalog under
  `~/.codex/...`
- activate the provider globally in `~/.codex/config.toml`

`local` scope:

- still keep the secret, helper command, and model catalog under `~/.codex/...`
- write only activation settings to `<project-root>/.codex/config.toml`
- write provider auth and trust metadata to user config
- rely on Codex project trust so the project layer is actually loaded

If `<project-root>/.codex/config.toml` is already tracked in git, the installer
offers `user` scope or cancel rather than mutating a tracked file.

## Product Boundary

The current v1 target is Codex CLI. Desktop app behavior should be treated as
best-effort because custom-provider support there remains less predictable than
the CLI path.
