import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  KAFKA_BROKERS: z.string().min(1),
  RABBITMQ_URL: z.string().url(),
});

export type AppConfig = {
  readonly nodeEnv: 'development' | 'test' | 'staging' | 'production';
  readonly port: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly kafkaBrokers: readonly string[];
  readonly rabbitmqUrl: string;
};

export const parseAppConfig = (env: NodeJS.ProcessEnv): AppConfig => {
  const parsed = configSchema.parse(env);

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    kafkaBrokers: parsed.KAFKA_BROKERS.split(',')
      .map((broker) => broker.trim())
      .filter(Boolean),
    rabbitmqUrl: parsed.RABBITMQ_URL,
  };
};
