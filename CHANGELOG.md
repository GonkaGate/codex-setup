# Changelog

## [Unreleased]

- Implemented the interactive Codex installer behind
  `npx @gonkagate/codex-setup`.
- Added command-backed GonkaGate provider setup for Codex CLI, including
  token-file storage, helper command generation, curated `model_catalog_json`,
  user and local scope handling, backups, and local git safety.
- Added runtime tests for config writing, tracked local config fallback, and
  secret-preserving backup behavior.
- Updated `README.md`, `docs/`, and repository contract files to describe the
  implemented installer rather than the earlier scaffold-only state.

## [0.1.0] - 2026-04-02

- Initial repository bootstrap for the future GonkaGate Codex installer.
