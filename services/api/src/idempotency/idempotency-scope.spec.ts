import { AppError } from '../common/errors/app-error.js';
import { resolveScopeFromRequest } from './idempotency-scope.js';
import { describe, expect, it } from 'vitest';

describe('resolveScopeFromRequest', () => {
  it('returns the context scope when an organization id is present', () => {
    const request = {
      context: { organizationId: 'org-1' },
    } as never;

    expect(resolveScopeFromRequest(request)).toEqual({
      organizationId: 'org-1',
    });
  });

  it('preserves store and user ids from the context', () => {
    const request = {
      context: { organizationId: 'org-1', storeId: 's-1', userId: 'u-1' },
    } as never;

    expect(resolveScopeFromRequest(request)).toEqual({
      organizationId: 'org-1',
      storeId: 's-1',
      userId: 'u-1',
    });
  });

  it('rejects a request without a context scope', () => {
    const request = {} as never;
    expect(() => resolveScopeFromRequest(request)).toThrow(AppError);
    try {
      resolveScopeFromRequest(request);
    } catch (error) {
      expect(error).toMatchObject({
        code: 'IDEMPOTENCY_SCOPE_UNAVAILABLE',
        statusCode: 500,
      });
    }
  });

  it('rejects a context without an organization id', () => {
    const request = { context: {} } as never;
    expect(() => resolveScopeFromRequest(request)).toThrow(
      /could not be resolved/,
    );
  });
});
