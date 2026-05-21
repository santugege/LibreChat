import { createHash, timingSafeEqual } from 'crypto';

const EASYPAY_FETCH_TIMEOUT_MS = 10 * 1000;
const EASYPAY_RESPONSE_MAX_BYTES = 64 * 1024;

export type EasyPayParams = {
  [key: string]: string | undefined;
};

export type EasyPayNotify = {
  pid: string;
  outTradeNo: string;
  tradeNo: string;
  amount: number;
  success: boolean;
  rawBody: string;
};

export type QueryEasyPayOrderInput = {
  apiBase: string;
  pid: string;
  pkey: string;
  outTradeNo: string;
};

export type QueryEasyPayOrderResult = {
  paid: boolean;
  tradeNo?: string;
  amount?: number;
  raw: string;
};

function isSignableValue(value: string | undefined): value is string {
  return value !== undefined && value !== '';
}

function signaturesMatch(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isObjectRecord(value: unknown): value is { [key: string]: unknown } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeApiBase(apiBase: string): string {
  return apiBase.trim().replace(/\/+$/, '');
}

function getResponseCode(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function getOptionalAmount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function isPaidStatus(value: unknown): boolean {
  if (value === 1) {
    return true;
  }

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toUpperCase();
  return normalized === '1' || normalized === 'TRADE_SUCCESS' || normalized === 'TRADE_FINISHED';
}

async function readBoundedResponseBody(response: Response): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > EASYPAY_RESPONSE_MAX_BYTES) {
      throw new Error('ZPay order query response too large');
    }

    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;

  while (true) {
    const result = await reader.read();

    if (result.done) {
      break;
    }

    bytes += result.value.byteLength;
    if (bytes > EASYPAY_RESPONSE_MAX_BYTES) {
      await reader.cancel();
      throw new Error('ZPay order query response too large');
    }

    chunks.push(decoder.decode(result.value, { stream: true }));
  }

  chunks.push(decoder.decode());
  return chunks.join('');
}

function parseEasyPayOrderQuery(text: string): QueryEasyPayOrderResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('ZPay order query returned invalid JSON');
  }

  if (!isObjectRecord(parsed)) {
    throw new Error('ZPay order query returned invalid response');
  }

  const code = getResponseCode(parsed.code);
  if (code === null) {
    throw new Error('ZPay order query returned invalid response');
  }

  if (code !== 1) {
    throw new Error(getOptionalString(parsed.msg) ?? 'ZPay order query failed');
  }

  const tradeNo = getOptionalString(parsed.trade_no);
  const amount = getOptionalAmount(parsed.money);

  return {
    paid: isPaidStatus(parsed.status),
    ...(tradeNo ? { tradeNo } : {}),
    ...(amount !== undefined ? { amount } : {}),
    raw: text,
  };
}

export async function queryEasyPayOrder(
  input: QueryEasyPayOrderInput,
): Promise<QueryEasyPayOrderResult> {
  const url = new URL(`${normalizeApiBase(input.apiBase)}/api.php`);
  url.searchParams.set('act', 'order');
  url.searchParams.set('pid', input.pid);
  url.searchParams.set('key', input.pkey);
  url.searchParams.set('out_trade_no', input.outTradeNo);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EASYPAY_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ZPay order query failed with HTTP ${response.status}`);
    }

    return parseEasyPayOrderQuery(await readBoundedResponseBody(response));
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error('ZPay order query timed out');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function signEasyPay(params: EasyPayParams, pkey: string): string {
  const base = Object.keys(params)
    .filter((key) => key !== 'sign' && key !== 'sign_type' && isSignableValue(params[key]))
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  return createHash('md5').update(`${base}${pkey}`).digest('hex');
}

function getRequiredParam(params: EasyPayParams, key: string): string {
  const value = params[key]?.trim();

  if (!value) {
    throw new Error(`Missing EasyPay ${key}`);
  }

  return value;
}

export function verifyEasyPayNotify(rawBody: string, pkey: string): EasyPayNotify {
  const params: EasyPayParams = {};
  new URLSearchParams(rawBody).forEach((value, key) => {
    params[key] = value;
  });

  const sign = params.sign;
  if (!sign) {
    throw new Error('Missing EasyPay signature');
  }

  if (params.sign_type?.trim().toUpperCase() !== 'MD5') {
    throw new Error('Invalid EasyPay sign_type');
  }

  const expected = signEasyPay(params, pkey);
  if (!signaturesMatch(expected, sign)) {
    throw new Error('Invalid EasyPay signature');
  }

  const pid = getRequiredParam(params, 'pid');
  const outTradeNo = getRequiredParam(params, 'out_trade_no');
  const tradeNo = getRequiredParam(params, 'trade_no');
  const tradeStatus = params.trade_status?.trim();
  if (tradeStatus !== 'TRADE_SUCCESS') {
    throw new Error('Invalid EasyPay trade_status');
  }

  const amount = params.money === undefined || params.money === '' ? NaN : Number(params.money);
  if (!Number.isFinite(amount)) {
    throw new Error('Invalid EasyPay amount');
  }

  return {
    pid,
    outTradeNo,
    tradeNo,
    amount,
    success: true,
    rawBody,
  };
}
