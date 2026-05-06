# Task Plan

## Goal

Start the local LibreChat project and configure the provided ChatGPT Plus-capable, OpenAI-compatible endpoint for text and image use.

## Phases

1. Record local plan and findings - in progress
2. Inspect LibreChat env/model config requirements - complete
3. Create local `.env` and `librechat.yaml` - complete
4. Install or verify dependencies/services - in progress
5. Start LibreChat and verify access - complete locally; upstream API POST remains unverified due timeout

## Decisions

- Keep the API key in local `.env`; do not print it in logs or final output.
- Prefer LibreChat's `custom` endpoint configuration unless local docs indicate a better supported path.
- Use `https://ca.ns2e.com/v1` as the configured OpenAI-compatible base URL.

## Errors

- `rtk Get-Content ...` failed because PowerShell cmdlets are not standalone executables; use `rtk powershell -Command ...`.
- Base URL probe attempt 1 failed because outer PowerShell expanded child-script `$key`/`$uri` variables inside double quotes; retry with single-quoted child command.
- Base URL probe attempt 2 failed because this PowerShell version does not support `Invoke-WebRequest -SkipHttpErrorCheck`; use `curl.exe`.
- Base URL probe attempt 3 timed out waiting for `curl.exe`; proceed with conventional OpenAI-compatible `/v1` base URL and validate during app startup.
- Docker service started, but Docker Desktop Linux engine pipe was still missing; start Docker Desktop and wait for engine readiness.
- Docker Desktop wait attempt 1 failed before execution due to outer PowerShell variable expansion in a double-quoted child script.
- Backend start attempt 1 connected to MongoDB and loaded config, then crashed because `client/dist/index.html` did not exist. Build the client before restarting backend.
- Direct upstream chat completion probe to `https://ca.ns2e.com/v1/chat/completions` timed out. Disable model auto-fetch to avoid UI delays and use configured defaults.
- Follow-up Node `fetch` probe succeeded for `https://ca.ns2e.com/v1/chat/completions` and `https://ca.ns2e.com/v1/responses` with `gpt5.5`; earlier timeout was due the curl/PowerShell probe path, not the gateway.
- Backend restart after `gpt5.5`/`image2` config succeeded.

## Current Investigation: Image Quota Deduction

### Goal

Start or verify the local LibreChat services, then determine whether subscription image quota deduction is actually wired into image generation flows.

### Phases

1. Map subscription quota and image tool code paths - complete
2. Verify local runtime state and subscription config - complete
3. Reproduce or test image quota consumption - complete
4. Identify root cause if deduction is missing - complete
5. Implement a narrowly scoped fix only after root cause is proven - complete
6. Run focused verification before reporting status - complete

### Errors

- `rtk Get-Content ...` failed because PowerShell cmdlets are not standalone executables; use `rtk powershell -NoProfile -Command ...`.
- Runtime probe confirmed the original failure: image tools loaded without any quota guard and no image usage event was written.
- Focused regression tests were written red first, then the image quota guard/wrapper/ToolService wiring was implemented.
- `npm run build:api` completed successfully after source changes.
- The post-fix probe confirmed `imageUsed: 1` for a valid image request and HTTP 429 quota denial for an oversized follow-up request.
