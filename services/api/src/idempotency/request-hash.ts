import { createHash } from 'node:crypto';

export function createRequestHash(
  method: string,
  path: string,
  body: unknown,
): string {
  const canonicalBody = canonicalJson(body);
  return createHash('sha256')
    .update(`${method}\n${path}\n${canonicalBody}`)
    .digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === undefined || value === null) {
    return 'null';
  }
  if (typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}
