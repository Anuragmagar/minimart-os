import 'dotenv/config';
import { Body, Controller, Module, Post } from '@nestjs/common';
import { IsInt, IsString, Min, MinLength, MaxLength } from 'class-validator';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { AppConfigModule } from '../src/config/app-config.module.js';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter.js';
import { ResponseFormatInterceptor } from '../src/common/interceptors/response-format.interceptor.js';
import { createValidationPipe } from '../src/common/validation/validation-pipe.js';
import { configureApp } from '../src/configure-app.js';
import { LoggingModule } from '../src/logging/logging.module.js';

class CreateItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name!: string;

  @IsInt()
  @Min(1)
  qty!: number;
}

@Controller('items')
class ItemsController {
  @Post()
  create(@Body() dto: CreateItemDto): { name: string; qty: number } {
    return dto;
  }
}

@Module({
  imports: [AppConfigModule, LoggingModule],
  controllers: [ItemsController],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_PIPE, useValue: createValidationPipe() },
    { provide: APP_INTERCEPTOR, useClass: ResponseFormatInterceptor },
  ],
})
class ItemsProbeModule {}

async function buildApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [ItemsProbeModule],
  }).compile();
  const app = configureApp(
    moduleFixture.createNestApplication<NestExpressApplication>(),
  );
  await app.init();
  return app;
}

describe('validation (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts a valid DTO', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/items')
      .send({ name: 'apple', qty: 3 })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual({
          data: { name: 'apple', qty: 3 },
          meta: {},
        });
      });
  });

  it('rejects an invalid DTO with canonical VALIDATION_FAILED and field_errors', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/items')
      .send({ name: 'x', qty: 0 })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.message).toBe('Validation failed');
    expect(response.body.error.field_errors.name).toEqual(
      expect.arrayContaining([expect.stringMatching(/longer/i)]),
    );
    expect(response.body.error.field_errors.qty).toEqual(
      expect.arrayContaining([expect.stringMatching(/less than/i)]),
    );
    expect(response.body.error.request_id).toEqual(expect.any(String));
  });

  it('rejects unknown properties via whitelist', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/items')
      .send({ name: 'apple', qty: 1, extra: 'boom' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.field_errors.extra).toBeDefined();
  });
});

describe('payload limit (e2e)', () => {
  let app: INestApplication<App>;
  const originalBodyLimit = process.env.BODY_LIMIT;

  beforeAll(async () => {
    process.env.BODY_LIMIT = '1kb';
    app = await buildApp();
  });

  afterAll(async () => {
    if (originalBodyLimit === undefined) {
      delete process.env.BODY_LIMIT;
    } else {
      process.env.BODY_LIMIT = originalBodyLimit;
    }
    await app.close();
  });

  it('rejects an oversized JSON body with PAYLOAD_TOO_LARGE', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/items')
      .send({ name: 'x'.repeat(4096), qty: 1 })
      .expect(413);

    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(response.body.error.message).toEqual(expect.any(String));
    expect(response.body.error.request_id).toEqual(expect.any(String));
  });
});
