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
