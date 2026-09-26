import { Test, TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/configure-app.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = configureApp(
      moduleFixture.createNestApplication<NestExpressApplication>(),
    );
    await app.init();
  });

  it('/api/v1 (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({
          data: 'Hello World!',
          meta: {},
        });
      });
  });

  it('/api/v1/health (GET) reports ok', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.data.status).toBe('ok');
        expect(res.body.data.service).toBe('minimart-api');
        expect(typeof res.body.data.timestamp).toBe('string');
        expect(res.body.meta).toEqual({});
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
