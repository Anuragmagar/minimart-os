import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig, LogLevel, NodeEnv } from './configuration.js';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<AppConfig>) {}

  get nodeEnv(): NodeEnv {
    return this.config.getOrThrow<NodeEnv>('nodeEnv');
  }

  get port(): number {
    return this.config.getOrThrow<number>('port');
  }

  get host(): string {
    return this.config.getOrThrow<string>('host');
  }

  get databaseUrl(): string {
    return this.config.getOrThrow<string>('databaseUrl');
  }

  get redisUrl(): string {
    return this.config.getOrThrow<string>('redisUrl');
  }

  get tz(): string {
    return this.config.getOrThrow<string>('tz');
  }

  get apiPrefix(): string {
    return this.config.getOrThrow<string>('apiPrefix');
  }

  get apiVersion(): string {
    return this.config.getOrThrow<string>('apiVersion');
  }

  get logLevel(): LogLevel {
    return this.config.getOrThrow<LogLevel>('logLevel');
  }

  get bodyLimit(): string {
    return this.config.getOrThrow<string>('bodyLimit');
  }

  get argon2MemoryCost(): number {
    return this.config.getOrThrow<number>('argon2MemoryCost');
  }

  get argon2TimeCost(): number {
    return this.config.getOrThrow<number>('argon2TimeCost');
  }

  get argon2Parallelism(): number {
    return this.config.getOrThrow<number>('argon2Parallelism');
  }

  get accessTokenTtlSeconds(): number {
    return this.config.getOrThrow<number>('accessTokenTtlSeconds');
  }

  get refreshTokenTtlSeconds(): number {
    return this.config.getOrThrow<number>('refreshTokenTtlSeconds');
  }

  get idempotencyTtlSeconds(): number {
    return this.config.getOrThrow<number>('idempotencyTtlSeconds');
  }
}
