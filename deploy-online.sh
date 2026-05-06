#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/librechat}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-feat/ai_sky_new}"
CONFIG_URL="${CONFIG_URL:-http://127.0.0.1:3080/api/config}"

COMPOSE_FILES=(-f deploy-compose.yml -f deploy-compose.local.yml -f docker-compose.https.yml)
BASE_HTTPS_COMPOSE_FILES=(-f deploy-compose.yml -f docker-compose.https.yml)

cd "$DEPLOY_DIR"

echo "Updating $DEPLOY_BRANCH in $DEPLOY_DIR"
git fetch origin
git checkout "$DEPLOY_BRANCH"
git pull --ff-only origin "$DEPLOY_BRANCH"
git rev-parse --short HEAD

test -f deploy-compose.local.yml
docker compose "${COMPOSE_FILES[@]}" config --services

docker compose "${BASE_HTTPS_COMPOSE_FILES[@]}" stop rag_api vectordb 2>/dev/null || true
docker compose "${BASE_HTTPS_COMPOSE_FILES[@]}" rm -f rag_api vectordb 2>/dev/null || true

docker compose "${COMPOSE_FILES[@]}" pull client mongodb meilisearch
docker compose "${COMPOSE_FILES[@]}" build --pull api
docker compose "${COMPOSE_FILES[@]}" up -d --force-recreate --remove-orphans

docker compose "${COMPOSE_FILES[@]}" exec -T api sh -lc 'cd /app && npm run seed-subscriptions'

docker compose "${COMPOSE_FILES[@]}" ps
docker compose "${COMPOSE_FILES[@]}" logs --tail=100 api

echo "Checking subscription config at $CONFIG_URL"
for attempt in $(seq 1 30); do
  if config_json="$(curl -fsS "$CONFIG_URL")"; then
    printf '%s\n' "$config_json" | grep -o '"subscriptions":{"enabled":[^}]*}'
    exit 0
  fi

  echo "Waiting for API config endpoint... ($attempt/30)"
  sleep 2
done

echo "ERROR: API config endpoint did not become ready: $CONFIG_URL" >&2
exit 1
