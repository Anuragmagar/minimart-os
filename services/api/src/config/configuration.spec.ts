import { describe, expect, it } from 'vitest';
import configuration, {
  appConfigValidationSchema,
  LOG_LEVELS,
  NODE_ENVS,
} from './configuration.js';

const ORIGINAL_ENV = { ...process.env };

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) {
        process.env[key] = ORIGINAL_ENV[key];
      } else {
        delete process.env[key];
      }
    }
  }
}

describe('configuration', () => {
  it('applies defaults when environment variables are absent', () => {
    withEnv(
      {
        NODE_ENV: undefined,
        PORT: undefined,
        HOST: undefined,
        DATABASE_URL: 'postgres://u:p@db:5432/dev',
        REDIS_URL: undefined,
        TZ: undefined,
        API_PREFIX: undefined,
        API_VERSION: undefined,
        LOG_LEVEL: undefined,
        BODY_LIMIT: undefined,
        ARGON2_MEMORY_COST: undefined,
        ARGON2_TIME_COST: undefined,
        ARGON2_PARALLELISM: undefined,
        ACCESS_TOKEN_TTL_SECONDS: undefined,
        REFRESH_TOKEN_TTL_SECONDS: undefined,
        IDEMPOTENCY_TTL_SECONDS: undefined,
      },
      () => {
        const config = configuration();
        expect(config.nodeEnv).toBe('development');
        expect(config.port).toBe(3000);
        expect(config.host).toBe('0.0.0.0');
        expect(config.databaseUrl).toBe('postgres://u:p@db:5432/dev');
        expect(config.redisUrl).toBe('redis://localhost:6379');
        expect(config.tz).toBe('Asia/Kathmandu');
        expect(config.apiPrefix).toBe('api');
        expect(config.apiVersion).toBe('v1');
        expect(config.logLevel).toBe('info');
        expect(config.bodyLimit).toBe('1mb');
        expect(config.argon2MemoryCost).toBe(19456);
        expect(config.argon2TimeCost).toBe(2);
        expect(config.argon2Parallelism).toBe(1);
        expect(config.accessTokenTtlSeconds).toBe(900);
        expect(config.refreshTokenTtlSeconds).toBe(604800);
        expect(config.idempotencyTtlSeconds).toBe(86400);
      },
    );
  });

  it('reads values from the environment', () => {
    withEnv(
      {
        NODE_ENV: 'production',
        PORT: '8080',
        HOST: '127.0.0.1',
        DATABASE_URL: 'postgres://user:pass@db:5432/prod',
        REDIS_URL: 'redis://redis:6379',
        TZ: 'UTC',
        API_PREFIX: 'api',
        API_VERSION: 'v2',
        LOG_LEVEL: 'warn',
        BODY_LIMIT: '2mb',
        ARGON2_MEMORY_COST: '32768',
        ARGON2_TIME_COST: '3',
        ARGON2_PARALLELISM: '2',
        ACCESS_TOKEN_TTL_SECONDS: '1800',
        REFRESH_TOKEN_TTL_SECONDS: '1209600',
        IDEMPOTENCY_TTL_SECONDS: '172800',
      },
      () => {
        const config = configuration();
        expect(config.nodeEnv).toBe('production');
        expect(config.port).toBe(8080);
        expect(config.host).toBe('127.0.0.1');
        expect(config.databaseUrl).toBe('postgres://user:pass@db:5432/prod');
        expect(config.redisUrl).toBe('redis://redis:6379');
        expect(config.tz).toBe('UTC');
        expect(config.apiPrefix).toBe('api');
        expect(config.apiVersion).toBe('v2');
        expect(config.logLevel).toBe('warn');
        expect(config.bodyLimit).toBe('2mb');
        expect(config.argon2MemoryCost).toBe(32768);
        expect(config.argon2TimeCost).toBe(3);
        expect(config.argon2Parallelism).toBe(2);
        expect(config.accessTokenTtlSeconds).toBe(1800);
        expect(config.refreshTokenTtlSeconds).toBe(1209600);
        expect(config.idempotencyTtlSeconds).toBe(172800);
      },
    );
  });

  it('throws when DATABASE_URL is missing', () => {
    withEnv({ DATABASE_URL: undefined }, () => {
      expect(() => configuration()).toThrow(/DATABASE_URL/);
    });
  });
});

describe('appConfigValidationSchema', () => {
  it('accepts a valid configuration', () => {
    const result = appConfigValidationSchema.safeParse({
      NODE_ENV: 'test',
      PORT: '4000',
      DATABASE_URL: 'postgres://u:p@db:5432/db',
      API_VERSION: 'v1',
      LOG_LEVEL: 'debug',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown NODE_ENV', () => {
    const result = appConfigValidationSchema.safeParse({
      NODE_ENV: 'staging',
      DATABASE_URL: 'postgres://u:p@db:5432/db',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing DATABASE_URL', () => {
    const result = appConfigValidationSchema.safeParse({ PORT: '3000' });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer PORT', () => {
    const result = appConfigValidationSchema.safeParse({
      PORT: '3000.5',
      DATABASE_URL: 'postgres://u:p@db:5432/db',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown LOG_LEVEL', () => {
    const result = appConfigValidationSchema.safeParse({
      LOG_LEVEL: 'verbose',
      DATABASE_URL: 'postgres://u:p@db:5432/db',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an API_VERSION not matching v<digits>', () => {
    const result = appConfigValidationSchema.safeParse({
      API_VERSION: 'latest',
      DATABASE_URL: 'postgres://u:p@db:5432/db',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid BODY_LIMIT', () => {
    const result = appConfigValidationSchema.safeParse({
      BODY_LIMIT: 'huge',
      DATABASE_URL: 'postgres://u:p@db:5432/db',
    });
    expect(result.success).toBe(false);
  });

  it('exposes all NODE_ENV and LOG_LEVEL values', () => {
    expect(NODE_ENVS).toEqual(['development', 'test', 'production']);
    expect(LOG_LEVELS).toEqual(['debug', 'info', 'warn', 'error']);
  });
});
