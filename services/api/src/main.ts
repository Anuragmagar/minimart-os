import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { configureApp } from './configure-app.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  configureApp(app);
  const config = app.get(AppConfigService);
  await app.listen(config.port, config.host);
}
await bootstrap();
