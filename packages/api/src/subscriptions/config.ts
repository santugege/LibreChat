const DEFAULT_TIMEZONE = 'Asia/Shanghai';
const DEFAULT_FREE_TEXT_DAILY_LIMIT = 20;
const DEFAULT_FREE_IMAGE_DAILY_LIMIT = 2;

export type SubscriptionConfig = {
  enabled: boolean;
  timezone: string;
  freeTextDailyLimit: number;
  freeImageDailyLimit: number;
};

export type SubscriptionEnv = NodeJS.ProcessEnv;

function readNonnegativeNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return fallback;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function getSubscriptionConfig(env: SubscriptionEnv = process.env): SubscriptionConfig {
  const configuredTimezone = env.SUBSCRIPTION_QUOTA_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
  const timezone = isValidTimeZone(configuredTimezone) ? configuredTimezone : DEFAULT_TIMEZONE;

  return {
    enabled: env.SUBSCRIPTIONS_ENABLED?.trim().toLowerCase() === 'true',
    timezone,
    freeTextDailyLimit: readNonnegativeNumber(
      env.SUBSCRIPTION_FREE_TEXT_DAILY_LIMIT,
      DEFAULT_FREE_TEXT_DAILY_LIMIT,
    ),
    freeImageDailyLimit: readNonnegativeNumber(
      env.SUBSCRIPTION_FREE_IMAGE_DAILY_LIMIT,
      DEFAULT_FREE_IMAGE_DAILY_LIMIT,
    ),
  };
}
