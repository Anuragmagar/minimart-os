import { describe, expect, it } from 'vitest';
import { createRequestHash } from './request-hash.js';

describe('createRequestHash', () => {
  it('produces a stable hash for identical method, path and body', () => {
    const first = createRequestHash('POST', '/api/v1/orders', {
      a: 1,
      b: 'x',
    });
    const second = createRequestHash('POST', '/api/v1/orders', {
      b: 'x',
      a: 1,
    });
    expect(first).toBe(second);
  });

  it('is stable regardless of object key order', () => {
    const hash = createRequestHash('PUT', '/api/v1/products/1', {
      nested: { z: 1, a: { y: 2, b: 3 } },
      items: [{ id: 1 }, { id: 2 }],
    });
    const reordered = createRequestHash('PUT', '/api/v1/products/1', {
      items: [{ id: 1 }, { id: 2 }],
      nested: { a: { b: 3, y: 2 }, z: 1 },
    });
    expect(hash).toBe(reordered);
  });

  it('changes when the method changes', () => {
    expect(createRequestHash('POST', '/api/v1/orders', { a: 1 })).not.toBe(
      createRequestHash('PUT', '/api/v1/orders', { a: 1 }),
    );
  });

  it('changes when the path changes', () => {
    expect(createRequestHash('POST', '/api/v1/orders', { a: 1 })).not.toBe(
      createRequestHash('POST', '/api/v1/orders/2', { a: 1 }),
    );
  });

  it('changes when the body changes', () => {
    expect(createRequestHash('POST', '/api/v1/orders', { a: 1 })).not.toBe(
      createRequestHash('POST', '/api/v1/orders', { a: 2 }),
    );
  });

  it('treats missing body and null body as equal', () => {
    expect(createRequestHash('GET', '/api/v1/products', undefined)).toBe(
      createRequestHash('GET', '/api/v1/products', null),
    );
  });

  it('treats differently ordered arrays as different requests', () => {
    const a = createRequestHash('POST', '/api/v1/returns', {
      items: [
        { sku: 'x', qty: 2 },
        { sku: 'y', qty: 1 },
      ],
    });
    const b = createRequestHash('POST', '/api/v1/returns', {
      items: [
        { sku: 'y', qty: 1 },
        { sku: 'x', qty: 2 },
      ],
    });
    expect(a).not.toBe(b);
  });
});
