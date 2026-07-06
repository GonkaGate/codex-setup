# Security Notes

`@gonkagate/codex-setup` manages credentials and config on the user's machine,
so the implementation is intentionally conservative.

## Secret Handling Rules

- Never print the GonkaGate `gp-...` key.
- Never accept the key through a plain CLI flag that could leak into shell
  history or process listings.
- Never write the secret into repository-local files.
- Keep the secret under `~/.codex/...` with owner-only permissions.
- Use a helper command plus Codex provider `auth` config instead of relying on
  exported env vars.
- Fetch `GET https://api.gonkagate.com/v1/models` with bearer auth only after
  the hidden key prompt and local key validation.
- Preserve unrelated Codex config instead of overwriting the whole file.
- Create backups before replacing existing managed config or token files.

## Why Not `auth.json`

Codex auth storage can be backed by a file, keyring, auto mode, or ephemeral
mode. Even though there is an internal file format for auth storage, that is
not a stable integration contract for external tooling.

Because of that, the installer does not write directly to `auth.json`. The
stable integration layer is the documented provider configuration surface plus
command-backed auth.

## File Placement Strategy

Expected managed user paths:

- `~/.codex/config.toml`
- `~/.codex/gonkagate/token`
- `~/.codex/bin/gonkagate-token`
- `~/.codex/model-catalogs/gonkagate.json`

Expected repo-local path:

- `<project-root>/.codex/config.toml`

Only the repo-local activation file may live inside the repository, and only
when the user explicitly chooses `local` scope. Even then, the secret remains
in user scope.

## Local Git Safety

If `<project-root>/.codex/config.toml` is already tracked, the installer does
not mutate it. The safe options are:

- switch to `user` scope
- cancel the install

If the local file is untracked, the installer adds it to `.git/info/exclude`
along with `.codex/config.toml.backup-*` so the file stays local by default.

## Permissions And Backups

- token files use owner-only permissions
- helper commands use owner-only permissions
- backups of secret-bearing config and token files also remain owner-only
- overwrite operations create backups first and preserve unrelated config

These rules are part of the repo contract. Any change to auth flow, secret
storage, repo-local scope, or backup behavior should update this document.
