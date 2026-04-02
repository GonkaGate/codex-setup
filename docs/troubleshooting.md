# Troubleshooting

## The installer says my Codex version is too old

The current implementation depends on provider auth and model-catalog behavior
verified against stable `@openai/codex` `0.118.0` on April 2, 2026. Upgrade
Codex CLI first, then rerun the installer.

## The local project override is ignored

Codex only reads `.codex/config.toml` as a project-layer override when the
project is trusted. The installer handles this for `local` scope by writing
`projects."<abs-path>".trust_level = "trusted"` to user config.

## Why not use `openai_base_url`?

That path reconfigures the built-in OpenAI provider and is a worse fit for a
gateway that has its own auth story and should be represented as a separate
custom provider. The intended path here is a dedicated `model_provider` entry
plus `[model_providers.gonkagate]`.

## Why does the gateway need Responses API support?

Codex custom providers support `wire_api = "responses"`. If the GonkaGate
endpoint is only "OpenAI-compatible" in an older chat-completions sense and
does not actually satisfy Responses API semantics and streaming behavior, the
integration will not be viable.

## Why keep the secret outside the repository even for local scope?

Codex does not have a Claude Code-style repo-local secret layer. To keep the
repository settings safe, the secret still lives in `~/.codex/...`, while the
repo-local file only activates provider, model, and catalog selection.

## What if `.codex/config.toml` is already tracked?

The installer does not silently modify a tracked project config file. The safe
fallback is to switch to `user` scope or cancel the operation.

## What about the desktop app?

The current product recommendation is CLI-first. Shared config layers may still
help in the desktop app, but that should be treated as best-effort behavior
until the app path is proven reliable for custom providers.
