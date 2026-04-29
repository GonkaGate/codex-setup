# Changelog

## [Unreleased]

- Added `moonshotai/Kimi-K2.6` to the curated GonkaGate Codex model registry
  and generated `model_catalog_json`.
- Implemented the interactive Codex installer behind
  `npx @gonkagate/codex-setup`.
- Added command-backed GonkaGate provider setup for Codex CLI, including
  token-file storage, helper command generation, curated `model_catalog_json`,
  user and local scope handling, backups, and local git safety.
- Added runtime tests for config writing, tracked local config fallback, and
  secret-preserving backup behavior.
- Refactored config planning so scope-to-layer ownership is centralized and
  TOML no-op detection now lives in the managed-write seam.
- Added explicit `model-catalog:generate` and `model-catalog:check` workflows,
  a committed model-catalog source snapshot, and drift checks for the generated
  curated catalog module.
- Updated `README.md`, `docs/`, and repository contract files to describe the
  implemented installer rather than the earlier scaffold-only state.

## [0.1.0] - 2026-04-02

- Initial repository bootstrap for the future GonkaGate Codex installer.
