import { Controller, Module, Post, UseInterceptors } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureApp } from '../src/configure-app.js';
import { AppConfigModule } from '../src/config/app-config.module.js';
import { LoggingModule } from '../src/logging/logging.module.js';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter.js';
import { ResponseFormatInterceptor } from '../src/common/interceptors/response-format.interceptor.js';
import { AppError } from '../src/common/errors/app-error.js';
import { IdempotencyInterceptor } from '../src/idempotency/idempotency.interceptor.js';
import {
  IDEMPOTENCY_SCOPE_RESOLVER,
  type IdempotencyScope,
} from '../src/idempotency/idempotency-scope.js';
import { IdempotencyService } from '../src/idempotency/idempotency.service.js';
import type {
  IdempotencyExecuteParams,
  IdempotencyOutcome,
} from '../src/idempotency/idempotency.service.js';

const SCOPE: IdempotencyScope = {
  organizationId: '44444444-4444-4444-4444-444444444444',
};

class FakeIdempotencyService {
  private outcomes = new Map<
    string,
    { requestHash: string; outcome: IdempotencyOutcome<unknown> }
  >();

  async execute<T>(
    params: IdempotencyExecuteParams<T>,
  ): Promise<IdempotencyOutcome<T>> {
    const key = `${params.scope.organizationId}:${params.operationKey}`;
    const existing = this.outcomes.get(key);
    if (existing) {
      if (existing.requestHash === params.requestHash) {
        return existing.outcome as IdempotencyOutcome<T>;
      }
      throw new AppError({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency key was already used for a different request',
        statusCode: 409,
      });
    }
    const result = await params.run(null as never);
    const outcome: IdempotencyOutcome<T> = {
      outcome: 'executed',
      result,
      responseStatus: 201,
    };
    this.outcomes.set(key, {
      requestHash: params.requestHash,
      outcome: outcome as IdempotencyOutcome<unknown>,
    });
    return outcome;
  }
}

@Controller('demo')
class DemoController {
  @Post('orders')
  @UseInterceptors(IdempotencyInterceptor)
  createOrder() {
    return { orderId: 'ORD-DEMO-1', ok: true };
  }
}

@Module({
  imports: [AppConfigModule, LoggingModule],
  controllers: [DemoController],
  providers: [
    IdempotencyInterceptor,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseFormatInterceptor },
    {
      provide: IDEMPOTENCY_SCOPE_RESOLVER,
      useValue: () => SCOPE,
    },
    {
      provide: IdempotencyService,
      useClass: FakeIdempotencyService,
    },
  ],
})
class DemoModule {}

describe('IdempotencyInterceptor (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [DemoModule],
    }).compile();

    app = configureApp(
      moduleFixture.createNestApplication<NestExpressApplication>(),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('executes and replays the same response for an identical request with the same key', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/demo/orders')
      .set('Idempotency-Key', 'demo-key-1')
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          data: { orderId: 'ORD-DEMO-1', ok: true },
          meta: {},
        });
      });

    const replay = await request(app.getHttpServer())
      .post('/api/v1/demo/orders')
      .set('Idempotency-Key', 'demo-key-1')
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          data: { orderId: 'ORD-DEMO-1', ok: true },
          meta: {},
        });
      });

    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
  });

  it('returns a conflict when the same key is used with a different body', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/demo/orders')
      .send({ amount: 100 })
      .set('Idempotency-Key', 'demo-key-2')
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/demo/orders')
      .send({ amount: 200 })
      .set('Idempotency-Key', 'demo-key-2')
      .expect(409);
  });
});
