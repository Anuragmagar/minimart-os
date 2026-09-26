import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { AppConfigService } from '../config/app-config.service.js';
import {
  buildLoggingOptions,
  CORRELATION_ID_HEADER,
  defaultRedactPaths,
} from './logging-options.js';

function makeConfig(overrides: Partial<Record<string, unknown>> = {}) {
  const values = {
    nodeEnv: 'test',
    port: 3000,
    host: '0.0.0.0',
    databaseUrl: 'postgres://u:p@db:5432/db',
    redisUrl: 'redis://localhost:6379',
    tz: 'Asia/Kathmandu',
    apiPrefix: 'api',
    apiVersion: 'v1',
    logLevel: 'info',
    ...overrides,
  };
  return new AppConfigService({
    getOrThrow: (key: string) => values[key],
  } as never);
}

function fakeRequest(headers: Record<string, string> = {}): Request {
  return { headers, method: 'GET', url: '/health' } as Request;
}

function fakeResponse(): Response {
  return { statusCode: 200 } as Response;
}

describe('buildLoggingOptions', () => {
  it('uses the configured log level', () => {
    const options = buildLoggingOptions(makeConfig({ logLevel: 'debug' }));
    expect(options.level).toBe('debug');
  });

  it('reuses an inbound x-correlation-id header', () => {
    const options = buildLoggingOptions(makeConfig({ logLevel: 'info' }));
    const id = options.genReqId?.(
      fakeRequest({ [CORRELATION_ID_HEADER]: 'corr-123' }),
      fakeResponse(),
    );
    expect(id).toBe('corr-123');
  });

  it('generates a UUID when no correlation header is present', () => {
    const options = buildLoggingOptions(makeConfig({ logLevel: 'info' }));
    const id = options.genReqId?.(fakeRequest(), fakeResponse());
    expect(typeof id).toBe('string');
    const text = id as string;
    expect(text).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('serializes requests without exposing headers', () => {
    const options = buildLoggingOptions(makeConfig({ logLevel: 'info' }));
    const serialized = options.serializers?.req?.(fakeRequest());
    expect(serialized).toEqual({
      id: undefined,
      method: 'GET',
      url: '/health',
    });
  });
});

describe('defaultRedactPaths', () => {
  it('covers secrets and sensitive identifiers', () => {
    const paths = defaultRedactPaths();
    expect(paths).toContain('req.headers.authorization');
    expect(paths).toContain('req.headers.cookie');
    expect(paths).toContain('*.password');
    expect(paths).toContain('*.token');
    expect(paths).toContain('*.secret');
    expect(paths).toContain('*.apiKey');
    expect(paths).toContain('*.cardNumber');
    expect(paths).toContain('*.panNumber');
  });
});
