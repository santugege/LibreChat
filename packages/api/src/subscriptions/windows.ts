const MS_PER_DAY = 24 * 60 * 60 * 1000;

type LocalDateParts = {
  year: number;
  month: number;
  day: number;
};

export type QuotaWindow = {
  windowKey: string;
  windowStart: Date;
  windowEnd: Date;
};

function readNumberPart(parts: Intl.DateTimeFormatPart[], type: string): number {
  const part = parts.find((value) => value.type === type);
  if (!part) {
    throw new Error(`Unable to read ${type} from quota window date`);
  }

  return Number(part.value);
}

function getLocalDateParts(date: Date, timeZone: string): LocalDateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);

  return {
    year: readNumberPart(parts, 'year'),
    month: readNumberPart(parts, 'month'),
    day: readNumberPart(parts, 'day'),
  };
}

function addLocalDays(parts: LocalDateParts, days: number): LocalDateParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + days * MS_PER_DAY);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function compareLocalDateParts(left: LocalDateParts, right: LocalDateParts): number {
  if (left.year !== right.year) {
    return left.year - right.year;
  }

  if (left.month !== right.month) {
    return left.month - right.month;
  }

  return left.day - right.day;
}

function getLocalDateBoundaryUtc(parts: LocalDateParts, timeZone: string): Date {
  const wallClockUtc = Date.UTC(parts.year, parts.month - 1, parts.day);
  let low = wallClockUtc - 2 * MS_PER_DAY;
  let high = wallClockUtc + 2 * MS_PER_DAY;

  while (compareLocalDateParts(getLocalDateParts(new Date(low), timeZone), parts) >= 0) {
    low -= MS_PER_DAY;
  }

  while (compareLocalDateParts(getLocalDateParts(new Date(high), timeZone), parts) < 0) {
    high += MS_PER_DAY;
  }

  while (low + 1 < high) {
    const mid = Math.floor((low + high) / 2);
    const comparison = compareLocalDateParts(getLocalDateParts(new Date(mid), timeZone), parts);
    if (comparison < 0) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return new Date(high);
}

function formatWindowKey(parts: LocalDateParts): string {
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-');
}

export function getQuotaWindow(now: Date, timeZone: string): QuotaWindow {
  if (!Number.isFinite(now.getTime())) {
    throw new Error('Quota window date must be valid');
  }

  const localDate = getLocalDateParts(now, timeZone);
  const nextLocalDate = addLocalDays(localDate, 1);

  return {
    windowKey: formatWindowKey(localDate),
    windowStart: getLocalDateBoundaryUtc(localDate, timeZone),
    windowEnd: getLocalDateBoundaryUtc(nextLocalDate, timeZone),
  };
}
