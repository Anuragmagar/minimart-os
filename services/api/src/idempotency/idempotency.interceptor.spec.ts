import { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { lastValueFrom, of } from 'rxjs';
import {
  IDEMPOTENCY_KEY_HEADER,
  IdempotencyInterceptor,
} from './idempotency.interceptor.js';
import type { IdempotencyService } from './idempotency.service.js';
import { createRequestHash } from './request-hash.js';
import { AppError } from '../common/errors/app-error.js';

const ORG_ID = '11111111-1111-1111-1111-111111111111';

function createContext(overrides: {
  header?: string | string[];
  method?: string;
  url?: string;
  body?: unknown;
  statusCode?: number;
}) {
  const response = { statusCode: overrides.statusCode ?? 200, status: vi.fn() };
  const request = {
    headers: {
      [IDEMPOTENCY_KEY_HEADER]: overrides.header,
    },
    method: overrides.method ?? 'POST',
    originalUrl: overrides.url ?? '/api/v1/orders',
    body: overrides.body ?? { amount: 100 },
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ExecutionContext;
}

function createInterceptor(serviceOverrides?: Partial<IdempotencyService>) {
  const executeMock = vi.fn().mockResolvedValue({
    outcome: 'executed',
    result: { ok: true },
    responseStatus: 201,
  });
  const service = {
    execute: executeMock,
    ...serviceOverrides,
  } as unknown as IdempotencyService;
  const scopeResolver = vi.fn().mockReturnValue({ organizationId: ORG_ID });
  const interceptor = new IdempotencyInterceptor(
    service,
    scopeResolver as never,
  );
  return { interceptor, executeMock, scopeResolver };
}

describe('IdempotencyInterceptor', () => {
  it('passes through when no idempotency key header is present', async () => {
    const { interceptor, executeMock, scopeResolver } = createInterceptor();
    const context = createContext({ header: undefined });
    const next = { handle: vi.fn().mockReturnValue(of({ ok: true })) };

    const result = await interceptor.intercept(context, next);

    await expect(lastValueFrom(result)).resolves.toEqual({ ok: true });
    expect(executeMock).not.toHaveBeenCalled();
    expect(scopeResolver).not.toHaveBeenCalled();
  });

  it('executes the handler inside the idempotency service when a key is present', async () => {
    const { interceptor, executeMock, scopeResolver } = createInterceptor();
    const context = createContext({ header: 'key-1' });
    const next = { handle: vi.fn().mockReturnValue(of({ ok: true })) };

    const result = await interceptor.intercept(context, next);

    await expect(lastValueFrom(result)).resolves.toEqual({ ok: true });
    expect(executeMock).toHaveBeenCalledTimes(1);
    const params = executeMock.mock.calls[0][0] as {
      operationKey: string;
      scope: { organizationId: string };
      requestHash: string;
      run: () => Promise<unknown>;
    };
    expect(params.operationKey).toBe('key-1');
    expect(params.scope.organizationId).toBe(ORG_ID);
    expect(params.requestHash).toBe(
      createRequestHash('POST', '/api/v1/orders', { amount: 100 }),
    );
    expect(scopeResolver).toHaveBeenCalledTimes(1);
    await expect(params.run()).resolves.toEqual({ ok: true });
  });

  it('applies the stored status and body when the service replays', async () => {
    const replay = {
      outcome: 'replayed',
      result: { ok: false },
      responseStatus: 409,
    } as const;
    const { interceptor, executeMock } = createInterceptor({
      execute: vi.fn().mockResolvedValue(replay) as never,
    });
    const context = createContext({ header: 'key-2' });
    const next = { handle: vi.fn().mockReturnValue(of({})) };

    await interceptor.intercept(context, next);

    const response = context.switchToHttp().getResponse();
    expect(response.status).toHaveBeenCalledWith(409);
    expect(executeMock).not.toHaveBeenCalled();
  });

  it('propagates scope resolution errors', async () => {
    const boom = new AppError({
      code: 'IDEMPOTENCY_SCOPE_UNAVAILABLE',
      message: 'no scope',
      statusCode: 500,
    });
    const scopeResolver = vi.fn().mockImplementation(() => {
      throw boom;
    });
    const scopeInterceptor = new IdempotencyInterceptor(
      {} as unknown as IdempotencyService,
      scopeResolver as never,
    );
    const context = createContext({ header: 'key-3' });
    const next = { handle: vi.fn() };

    await expect(scopeInterceptor.intercept(context, next)).rejects.toBe(boom);
  });

  it('propagates conflicts from the idempotency service', async () => {
    const conflict = new AppError({
      code: 'IDEMPOTENCY_CONFLICT',
      message: 'different request',
      statusCode: 409,
    });
    const { interceptor } = createInterceptor({
      execute: vi.fn().mockRejectedValue(conflict),
    });
    const context = createContext({ header: 'key-4' });
    const next = { handle: vi.fn() };

    await expect(interceptor.intercept(context, next)).rejects.toBe(conflict);
  });
});
