import 'dotenv/config';
import {
  BadRequestException,
  Controller,
  Get,
  Module,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { APP_FILTER } from '@nestjs/core';
import request from 'supertest';
import { App } from 'supertest/types';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter.js';
import { AppError } from '../src/common/errors/app-error.js';
import { AppConfigModule } from '../src/config/app-config.module.js';
import { configureApp } from '../src/configure-app.js';
import { LoggingModule } from '../src/logging/logging.module.js';

@Controller()
class ErrorProbeController {
  @Get('app-error')
  appError(): never {
    throw new AppError({
      code: 'SAVE_ITEM',
      message: 'invalid item',
      statusCode: 422,
      fieldErrors: { qty: ['must be at least 1'] },
    });
  }

  @Get('not-found')
  notFound(): never {
    throw new NotFoundException('order not found');
  }

  @Get('bad-request')
  badRequest(): never {
    throw new BadRequestException({
      message: ['name is required', 'code is required'],
      error: 'Bad Request',
      statusCode: 400,
    });
  }

  @Get('internal')
  internal(): never {
    throw new Error('secret internal detail');
  }
}

@Module({
  imports: [AppConfigModule, LoggingModule],
  controllers: [ErrorProbeController],
  providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
})
class ErrorProbeModule {}

describe('GlobalExceptionFilter (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ErrorProbeModule],
    }).compile();
    app = configureApp(
      moduleFixture.createNestApplication<NestExpressApplication>(),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns canonical body for an AppError', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/app-error')
      .set('x-correlation-id', 'test-corr-1')
      .expect(422);

    expect(response.body).toEqual({
      error: {
        code: 'SAVE_ITEM',
        message: 'invalid item',
        details: {},
        field_errors: { qty: ['must be at least 1'] },
        request_id: 'test-corr-1',
      },
    });
  });

  it('maps a NotFoundException', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/not-found')
      .set('x-correlation-id', 'test-corr-2')
      .expect(404);

    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'order not found',
        details: {},
        field_errors: {},
        request_id: 'test-corr-2',
      },
    });
  });

  it('maps a BadRequestException message array to field errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/bad-request')
      .set('x-correlation-id', 'test-corr-3')
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.field_errors).toEqual({
      item_0: ['name is required'],
      item_1: ['code is required'],
    });
    expect(response.body.error.request_id).toBe('test-corr-3');
  });

  it('masks unexpected 500 errors and keeps correlation id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/internal')
      .set('x-correlation-id', 'test-corr-4')
      .expect(500);

    expect(response.body).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal Server Error',
        details: {},
        field_errors: {},
        request_id: 'test-corr-4',
      },
    });
  });

  it('generates a request_id when none is provided', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/not-found')
      .expect(404);

    expect(response.body.error.request_id).toEqual(expect.any(String));
    expect(response.body.error.request_id.length).toBeGreaterThan(0);
  });
});
