import { z } from 'zod';

import { resolveRuntimeProfile, type RuntimeProfile, validateRuntimeProfile } from './runtime-profile';

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  SOCIAL_MONITOR_RUNTIME_PROFILE: z.enum(['local-dev', 'deterministic-test', 'beta']).optional(),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  KAFKA_BROKERS: z.string().min(1),
  RABBITMQ_URL: z.string().url(),
});

export type AppConfig = {
  readonly nodeEnv: 'development' | 'test' | 'staging' | 'production';
  readonly runtimeProfile: RuntimeProfile;
  readonly port: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly kafkaBrokers: readonly string[];
  readonly rabbitmqUrl: string;
};

export const parseAppConfig = (env: NodeJS.ProcessEnv): AppConfig => {
  const parsed = configSchema.parse(env);
  const runtimeValidation = validateRuntimeProfile(env);

  if (runtimeValidation.violations.length > 0) {
    throw new Error(runtimeValidation.violations.join('; '));
  }

  return {
    nodeEnv: parsed.NODE_ENV,
    runtimeProfile: resolveRuntimeProfile(env),
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    kafkaBrokers: parsed.KAFKA_BROKERS.split(',')
      .map((broker) => broker.trim())
      .filter(Boolean),
    rabbitmqUrl: parsed.RABBITMQ_URL,
  };
};
