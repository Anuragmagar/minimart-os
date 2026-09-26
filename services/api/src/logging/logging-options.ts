import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { GenReqId, Options as PinoHttpOptions } from 'pino-http';
import type { AppConfigService } from '../config/app-config.service.js';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

export function buildLoggingOptions(
  config: AppConfigService,
): PinoHttpOptions<Request, Response> {
  return {
    level: config.logLevel,
    genReqId: requestId(CORRELATION_ID_HEADER),
    serializers: {
      req: (req: Request) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res: Response) => ({ statusCode: res.statusCode }),
    },
    redact: {
      paths: defaultRedactPaths(),
      censor: '[REDACTED]',
    },
  };
}

export function defaultRedactPaths(): string[] {
  return [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-api-key"]',
    '*.password',
    '*.passwordHash',
    '*.token',
    '*.accessToken',
    '*.refreshToken',
    '*.secret',
    '*.apiKey',
    '*.cardNumber',
    '*.panNumber',
  ];
}

function requestId(header: string): GenReqId<Request, Response> {
  return (req) => {
    const incoming = req.headers[header];
    if (typeof incoming === 'string' && incoming.length > 0) {
      return incoming;
    }
    return randomUUID();
  };
}
