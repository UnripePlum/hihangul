# Provider Integration (OpenClaw-style)

## What OpenClaw does

- OpenClaw stores account-linked credentials as local auth profiles.
- Claude integration path is based on `claude setup-token` style login, then profile-based usage.
- At runtime, provider/model is chosen per request (not hardcoded globally).

## Applied to HiHangul

We mirror that pattern with:

1. Local auth profile store
- File: `shared/memory/windows-brain/auth-profiles.json`
- API:
  - `GET /v1/auth/profiles`
  - `POST /v1/auth/profiles`

2. Per-request provider selection
- `TaskRequest.provider`: `claude | codex`
- `TaskRequest.profile_id`: profile key used for credential lookup
- `AuthProfile.auth_mode`: `token | codex_cli`

3. Orchestrator routing
- `claude` -> Claude model identifier
- `codex` -> Codex model identifier

## Important note about Codex account linkage

OpenAI account subscription and API credentials are separate systems. In practice, server-side integration should use API-capable credentials or CLI/OAuth session material stored in a profile.

## UI behavior

- User selects provider (`Claude` / `Codex`)
- Claude: set `Profile ID` + `Provider Token`
- Codex: set `Auth Mode = codex_cli`, then run `codex --login` on the host running windows-brain
- Save profile
- Run automation with selected provider/profile
