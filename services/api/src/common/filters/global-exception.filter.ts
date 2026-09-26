import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Logger } from 'nestjs-pino';
import { CORRELATION_ID_HEADER } from '../../logging/logging-options.js';
import { toCanonicalError, errorStatus } from '../errors/error-mapping.js';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const status = errorStatus(exception);

    const requestId = requestIdFrom(request);
    const canonical = toCanonicalError(exception, status);

    if (status >= 500) {
      this.logger.error(
        {
          err:
            exception instanceof Error
              ? exception
              : new Error(String(exception)),
          requestId,
          method: request.method,
          url: request.url,
        },
        'Unhandled exception',
      );
    }

    response.status(status).json({
      error: {
        code: canonical.code,
        message: canonical.message,
        details: canonical.details,
        field_errors: canonical.fieldErrors,
        request_id: requestId,
      },
    });
  }
}

function requestIdFrom(request: Request): string {
  const incoming =
    request.headers[CORRELATION_ID_HEADER] ?? request.headers['x-request-id'];
  if (typeof incoming === 'string' && incoming.length > 0) {
    return incoming;
  }
  const pinoId = (request as ExpressRequestWithId).id;
  if (typeof pinoId === 'string' || typeof pinoId === 'number') {
    return String(pinoId);
  }
  return randomUUID();
}

interface ExpressRequestWithId {
  id?: string | number;
}
