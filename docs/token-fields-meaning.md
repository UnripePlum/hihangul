# Token Fields Meaning in HiHangul

## 1) `auth_token` (TaskRequest)

- Location: request body for `POST /v1/lanes/{lane_id}/tasks`
- Purpose: HiHangul app-level access control (lane/session request gate)
- Current rule: must pass `AuthGuard` (example prefix `hk_`)
- This is NOT a Claude/Codex provider credential.

## 2) `provider token` (Auth Profile)

- Location: `POST /v1/auth/profiles` payload `token`
- Purpose: external provider credential for token-based providers (currently Claude)
- For Codex CLI mode (`auth_mode=codex_cli`), this token is not used and must be empty.

## 3) Codex mode now

- `provider=codex` requires `auth_mode=codex_cli`
- Required action: run `codex --login` on the same host where `windows-brain` runs
- Check endpoint: `GET /v1/auth/codex/status`
