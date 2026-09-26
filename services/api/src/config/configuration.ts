import { z } from 'zod';

export const NODE_ENVS = ['development', 'test', 'production'] as const;
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

export type NodeEnv = (typeof NODE_ENVS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

const BODY_LIMIT_PATTERN = /^\d+(\.\d+)?(b|kb|mb|gb)$/i;

export const appConfigValidationSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  TZ: z.string().min(1).default('Asia/Kathmandu'),
  API_PREFIX: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/)
    .default('api'),
  API_VERSION: z
    .string()
    .min(1)
    .regex(/^v[0-9]+$/)
    .default('v1'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  BODY_LIMIT: z.string().regex(BODY_LIMIT_PATTERN).default('1mb'),
  ARGON2_MEMORY_COST: z.coerce.number().int().min(1).default(19456),
  ARGON2_TIME_COST: z.coerce.number().int().min(1).default(2),
  ARGON2_PARALLELISM: z.coerce.number().int().min(1).default(1),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(1).default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(1).default(604800),
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().min(1).default(86400),
});

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  host: string;
  databaseUrl: string;
  redisUrl: string;
  tz: string;
  apiPrefix: string;
  apiVersion: string;
  logLevel: LogLevel;
  bodyLimit: string;
  argon2MemoryCost: number;
  argon2TimeCost: number;
  argon2Parallelism: number;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  idempotencyTtlSeconds: number;
}

export default function configuration(): AppConfig {
  const parsed = appConfigValidationSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  const env = parsed.data;
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    host: env.HOST,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    tz: env.TZ,
    apiPrefix: env.API_PREFIX,
    apiVersion: env.API_VERSION,
    logLevel: env.LOG_LEVEL,
    bodyLimit: env.BODY_LIMIT,
    argon2MemoryCost: env.ARGON2_MEMORY_COST,
    argon2TimeCost: env.ARGON2_TIME_COST,
    argon2Parallelism: env.ARGON2_PARALLELISM,
    accessTokenTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
    idempotencyTtlSeconds: env.IDEMPOTENCY_TTL_SECONDS,
  };
}
