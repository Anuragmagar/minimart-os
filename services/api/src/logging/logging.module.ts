import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AppConfigService } from '../config/app-config.service.js';
import { buildLoggingOptions } from './logging-options.js';

@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: buildLoggingOptions(config),
      }),
    }),
  ],
})
export class LoggingModule {}
