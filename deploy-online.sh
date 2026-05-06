#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/librechat}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-feat/ai_sky_new}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3080/health}"

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

docker compose "${COMPOSE_FILES[@]}" exec -T api sh -lc '
  test "${SUBSCRIPTIONS_ENABLED:-}" = "true"
  test -n "${IMAGE_GEN_OAI_API_KEY:-}"
  test -n "${IMAGE_GEN_OAI_BASEURL:-}"
  test -n "${IMAGE_GEN_OAI_MODEL:-}"
'

docker compose "${COMPOSE_FILES[@]}" exec -T api sh -lc 'cd /app && npm run seed-subscriptions'
docker compose "${COMPOSE_FILES[@]}" exec -T api sh -lc 'cd /app && node' <<'NODE'
const path = require('path');
const mongoose = require('mongoose');
const { createModels, runAsSystem } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(process.cwd(), 'api') });
require('./config/helpers');

createModels(mongoose);

const connect = require('./config/connect');

(async () => {
  await connect();

  const SubscriptionPlan = mongoose.models.SubscriptionPlan;
  const plans = await runAsSystem(async () =>
    SubscriptionPlan.find({})
      .sort({ tenantId: 1, sortOrder: 1, price: 1, key: 1 })
      .lean(),
  );

  const summary = plans.map((plan) => ({
    key: plan.key,
    tenantId: plan.tenantId ?? null,
    enabled: plan.enabled,
    textDailyLimit: plan.textDailyLimit,
    imageDailyLimit: plan.imageDailyLimit,
  }));

  console.log(JSON.stringify(summary, null, 2));

  const invalidPlans = plans.filter(
    (plan) =>
      plan.enabled &&
      (!Number.isInteger(plan.textDailyLimit) || !Number.isInteger(plan.imageDailyLimit)),
  );

  const hasDefaultFree = plans.some((plan) => plan.key === 'free' && plan.tenantId == null);
  const hasDefaultPro = plans.some((plan) => plan.key === 'pro_monthly' && plan.tenantId == null);

  if (!hasDefaultFree || !hasDefaultPro || invalidPlans.length > 0) {
    throw new Error('Subscription plan seed verification failed');
  }

  await mongoose.disconnect();
})().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
NODE

docker compose "${COMPOSE_FILES[@]}" ps
docker compose "${COMPOSE_FILES[@]}" logs --tail=100 api

echo "Checking API health at $HEALTH_URL"
for attempt in $(seq 1 30); do
  if curl -fsS "$HEALTH_URL" >/dev/null; then
    exit 0
  fi

  echo "Waiting for API health endpoint... ($attempt/30)"
  sleep 2
done

echo "ERROR: API health endpoint did not become ready: $HEALTH_URL" >&2
exit 1
