const DEFAULT_TIMEZONE = 'Asia/Shanghai';

export type SubscriptionConfig = {
  enabled: boolean;
  timezone: string;
};

export type SubscriptionEnv = NodeJS.ProcessEnv;

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
  };
}
