import { createHash, timingSafeEqual } from 'crypto';

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
