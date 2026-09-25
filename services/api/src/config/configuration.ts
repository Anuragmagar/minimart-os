export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  tz: string;
}

export default function configuration(): AppConfig {
  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
    databaseUrl:
      process.env.DATABASE_URL ??
      'postgres://minimart:changeme@localhost:5432/minimart',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    tz: process.env.TZ ?? 'Asia/Kathmandu',
  };
}
