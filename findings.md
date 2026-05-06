# Findings

## Project Instructions

- Shell commands should be prefixed with `rtk`.
- Backend runs on `http://localhost:3080/`; frontend dev server runs on `http://localhost:3090/`.
- New backend code should live under `packages/api`, but this task is local configuration/startup only.

## Configuration

- `.env.example` defines default `HOST=localhost`, `PORT=3080`, `MONGO_URI=mongodb://127.0.0.1:27017/LibreChat`, and optional `CONFIG_PATH`.
- `librechat.example.yaml` contains `endpoints.custom` examples with `apiKey`, `baseURL`, `models.default`, `models.fetch`, `titleConvo`, `titleModel`, and `modelDisplayLabel`.
- `packages/api/src/endpoints/custom/initialize.ts` initializes custom endpoints from config and supports env-var interpolation.
- `.gitignore` ignores `.env*`, `librechat.yaml`, `librechat.yml`, local Docker data, logs, and `node_modules`.
- `.env.example` includes required local auth/encryption values such as `CREDS_KEY`, `CREDS_IV`, `JWT_SECRET`, and `JWT_REFRESH_SECRET`.
- `.env.example` has OpenAI image tool variables: `IMAGE_GEN_OAI_API_KEY`, `IMAGE_GEN_OAI_BASEURL`, and `IMAGE_GEN_OAI_MODEL`.

## Startup

- `package.json` scripts include `npm run backend`, `npm run backend:dev`, and `npm run frontend:dev`.
- `docker-compose.yml` provides MongoDB, Meilisearch, vectordb, rag_api, and an API container image; local Node startup still needs MongoDB.
- `getEnabledEndpoints()` defaults to known endpoints, and custom endpoint names from config are preserved even when `ENDPOINTS` is unset.
- Docker CLI is installed, but `com.docker.service` is stopped and the Docker Desktop Linux engine pipe is unavailable.
- No `mongod`, `mongosh`, or `mongo` command is available on PATH.
- Ports 3080, 3090, 27017, and 7700 had no listeners at inspection time.
- `node` and `npm` are available: Node v24.13.1, npm 11.8.0.
- Direct probe of `https://ca.ns2e.com/v1/models`/`https://ca.ns2e.com/models` did not complete within the command timeout, so the config should use the conventional OpenAI-compatible `/v1` suffix and rely on LibreChat's fetch fallback defaults if remote listing is slow.
- `npm ci` installed workspace dependencies successfully. npm reported 39 audit findings but installation exited 0.
- `com.docker.service` was started successfully.
- Docker Desktop engine became available after starting Docker Desktop; server version is 29.4.0.
- MongoDB is reachable: `db.runCommand({ ping: 1 }).ok` returned `1`.
- Meili is reachable: `/health` returned `{"status":"available"}`.
- Backend uses plain `dotenv`, so `.env` values do not get second-pass expansion. `IMAGE_GEN_OAI_*` must contain actual values rather than `${NS2E_*}` references.
- `librechat.yaml` parses successfully with the installed `yaml` package.
- `npm run build:packages` completed successfully.
- Backend start attempt 1 reached MongoDB/Meili and loaded `librechat.yaml`, then failed on missing `client/dist/index.html`.
- `npm run build:client` completed successfully. It emitted bundle-size/PWA glob warnings but exited 0 and created `client/dist/index.html`.
- Backend start attempt 2 succeeded: port 3080 is listening and `/api/config` returned HTTP 200.
- Direct upstream chat completion probe timed out, so `models.fetch` was changed to `false` and LibreChat will use the configured default model list instead of fetching `/models`.
- `ca.ns2e.com` serves a VeloRoute AI Routing Gateway page. TCP 443 and the web UI respond, but OpenAI-compatible POST requests to chat completions timed out during verification.
- `HEAD /v1/models` returned 404; `POST /v1/chat/completions` timed out, which suggests the `/v1` chat route may exist but the gateway/upstream did not complete the request in time.
- Frontend dev server started on port 3090 and returned HTTP 200.
- Node `fetch` probe confirmed `POST https://ca.ns2e.com/v1/chat/completions` works with model `gpt5.5` and returns `pong`.
- Node `fetch` probe confirmed `POST https://ca.ns2e.com/v1/responses` works with model `gpt5.5`.
- Node `fetch` probe confirmed `GET https://ca.ns2e.com/v1/models` returns a model list including `gpt-5-codex`, `gpt-5.1-codex`, `gpt-5.2-codex`, `gpt-5.3-codex`, and `gpt-5.4`; `gpt5.5` works even though it was not in the returned model list.
- Updated default LibreChat models to prioritize `gpt5.5` and Codex-oriented GPT-5 models.
- Updated `IMAGE_GEN_OAI_MODEL` to `image2`.

## Image Quota Investigation

- Codebase retrieval points to `packages/api/src/subscriptions/quota.ts` as the quota service and `packages/data-schemas/src/methods/subscription.ts` as the atomic quota consumption storage layer.
- Text quota is enforced through `packages/api/src/subscriptions/middleware.ts`, which consumes quota with `kind: 'text'`.
- Existing planning notes in `docs/superpowers/plans/2026-05-02-subscription-management.md` describe a proposed `createImageQuotaGuard` and image-tool wrapping, but the retrieved checklist lines are still marked incomplete.
- Relevant image generation tool files include `api/app/clients/tools/structured/OpenAIImageTools.js` and `api/app/clients/tools/structured/GeminiImageGen.js`.
- Runtime `@librechat/api` resolves to `packages/api/dist/index.js`, and that build currently exports `createImageQuotaGuard`.
- `api/app/clients/tools/util/handleTools.js` does not mention `imageQuotaGuard` or `createImageQuotaGuard`.
- Direct route `POST /api/agents/tools/:toolId/call` is not suitable for image generation probing because `api/server/controllers/tools.js` only allows tools present in `fieldsMap`, currently `execute_code`.
- Current local services are listening on backend 3080, frontend 3090, MongoDB 27017, and Meili 7700.
- `.env` has subscriptions enabled and uses `Asia/Shanghai` for subscription quota windows.
- Runtime probe `.codex_work/probe-image-quota.js` loaded `image_gen_oai` and `image_edit_oai`; `loadTools.toString().includes('imageQuotaGuard')` returned `false`.
- Calling the loaded `image_gen_oai` tool with an empty payload failed at local validation with `Missing required field: prompt`, and image usage event count stayed unchanged (`callDelta: 0`).
- The proven failing boundary is the active tool-loading path: image quota consumption is supported in lower layers, but the loaded image tools are not wrapped with a guard in the current source path.
- After implementing guard wiring and rebuilding `packages/api`, the probe reports `mentionsImageQuotaGuard: true` and `hasImageQuotaGuardFactory: true`.
- With `IMAGE_GEN_OAI_BASEURL` overridden to a dead local URL inside the probe, a valid `image_gen_oai` request consumed quota before the upstream connection error: image event count increased by 1 and the usage bucket has `imageUsed: 1`.
- A second oversized `n: 10` image request for the same free-plan probe user was denied before upstream with HTTP 429 and a `subscription_quota` body; event count increased again with a released quota event and the bucket stayed at `imageUsed: 1`.
