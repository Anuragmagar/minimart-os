import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppConfigService } from './config/app-config.service.js';

export function configureApp(
  app: NestExpressApplication,
): NestExpressApplication {
  const config = app.get(AppConfigService);
  app.setGlobalPrefix(`${config.apiPrefix}/${config.apiVersion}`);
  app.useBodyParser('json', { limit: config.bodyLimit });
  return app;
}
