import { describe, expect, it } from 'vitest';
import { sanitizeForAudit } from './audit-sanitizer.js';

describe('sanitizeForAudit', () => {
  it('redacts known sensitive keys at the top level', () => {
    const result = sanitizeForAudit({
      name: 'Kathmandu Mart',
      password: 'plaintext',
      token: 'abc',
    });
    expect(result).toEqual({
      name: 'Kathmandu Mart',
      password: '[REDACTED]',
      token: '[REDACTED]',
    });
  });

  it('redacts sensitive keys by exact collision only', () => {
    const result = sanitizeForAudit({
      username: 'owner',
      passwordHash: 'hash',
      accessToken: 'token',
      cardNumber: '4111',
    });
    expect(result).toEqual({
      username: 'owner',
      passwordHash: '[REDACTED]',
      accessToken: '[REDACTED]',
      cardNumber: '[REDACTED]',
    });
  });

  it('recurses into nested objects and arrays', () => {
    const result = sanitizeForAudit({
      contact: {
        email: 'a@b.com',
        secret: 's3cret',
        list: [{ token: 't' }, 'keep'],
      },
    });
    expect(result).toEqual({
      contact: {
        email: 'a@b.com',
        secret: '[REDACTED]',
        list: [{ token: '[REDACTED]' }, 'keep'],
      },
    });
  });

  it('leaves non-sensitive keys and scalar values intact', () => {
    const result = sanitizeForAudit({
      name: 'Item',
      price: 25.5,
      tags: ['a', 'b'],
    });
    expect(result).toEqual({ name: 'Item', price: 25.5, tags: ['a', 'b'] });
  });

  it('passes through null and undefined', () => {
    expect(sanitizeForAudit(null)).toBeNull();
    expect(sanitizeForAudit(undefined)).toBeUndefined();
  });

  it('passes through scalar values', () => {
    expect(sanitizeForAudit('text')).toBe('text');
    expect(sanitizeForAudit(42)).toBe(42);
  });
});
