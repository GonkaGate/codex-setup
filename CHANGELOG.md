# Changelog

## [Unreleased]

- Replaced the checked-in GonkaGate model allowlist with live
  `GET https://api.gonkagate.com/v1/models` discovery.
- Implemented the interactive Codex installer behind
  `npx @gonkagate/codex-setup`.
- Added command-backed GonkaGate provider setup for Codex CLI, including
  token-file storage, helper command generation, live `model_catalog_json`,
  user and local scope handling, backups, and local git safety.
- Added runtime tests for config writing, tracked local config fallback, and
  secret-preserving backup behavior.
- Refactored config planning so scope-to-layer ownership is centralized and
  TOML no-op detection now lives in the managed-write seam.
- Updated `README.md`, `docs/`, and repository contract files to describe the
  implemented installer rather than the earlier scaffold-only state.

## [0.1.0] - 2026-04-02

- Initial repository bootstrap for the future GonkaGate Codex installer.
