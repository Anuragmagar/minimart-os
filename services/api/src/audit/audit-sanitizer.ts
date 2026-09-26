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
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_AUDIT_KEYS.has(key)
      ? REDACTED_AUDIT_VALUE
      : sanitizeForAudit(item);
  }
  return result;
}
