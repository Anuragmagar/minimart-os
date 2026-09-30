const SENSITIVE_AUDIT_KEYS = new Set([
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'cardNumber',
  'panNumber',
]);

const REDACTED_AUDIT_VALUE = '[REDACTED]';

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

export function sanitizeForAudit(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForAudit);
  }
  if (typeof value !== 'object') {
    return value;
  }
  // Class instances are not audited field by field. Prisma.Decimal for example
  // exposes its own enumerable `constructor` function, so copying its entries
  // produces a payload that JSON cannot store at all. Their `toJSON` is the
  // representation a client would receive, so it is the one recorded.
  if (!isPlainObject(value)) {
    const toJSON = (value as { toJSON?: unknown }).toJSON;
    if (typeof toJSON === 'function') {
      return sanitizeForAudit(toJSON.call(value));
    }
    // Nothing better is available, so the instance is recorded as its own text
    // form, which is how a Buffer or a bigint wrapper reads in a log anyway.
    return String(value as { toString(): string });
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_AUDIT_KEYS.has(key)
      ? REDACTED_AUDIT_VALUE
      : sanitizeForAudit(item);
  }
  return result;
}
