# Changelog

## [0.2.0](https://github.com/GonkaGate/codex-setup/compare/v0.1.0...v0.2.0) (2026-07-06)


### Features

* fetch GonkaGate models dynamically ([113c86e](https://github.com/GonkaGate/codex-setup/commit/113c86e33538acb8f981fd820e3b050b6c9632ce))


### Bug Fixes

* align Codex Kimi context window with Gonka deployment ([4fa03ea](https://github.com/GonkaGate/codex-setup/commit/4fa03ea0b7113102c5243713d727777e9bb2fbb1))
* align Codex Kimi context window with Gonka deployment ([2cb5818](https://github.com/GonkaGate/codex-setup/commit/2cb581877f90889a7617fbfd2fddb7357d658c31))

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
