import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';

export interface ApiEnvelope {
  data: unknown;
  meta: Record<string, unknown>;
}

@Injectable()
export class ResponseFormatInterceptor implements NestInterceptor {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiEnvelope> {
    return next.handle().pipe(
      map((data) => ({
        data: data ?? null,
        meta: {},
      })),
    );
  }
}
