import { parseAppConfig } from './app-config';
import { assertRuntimeProfileAllowsMode, resolveRuntimeProfile, validateRuntimeProfile } from './runtime-profile';

const validEnv = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://social_monitor:password@localhost:5432/social_monitor',
  REDIS_URL: 'redis://localhost:6379/0',
  KAFKA_BROKERS: 'localhost:9092,localhost:9094',
  RABBITMQ_URL: 'amqp://social_monitor:password@localhost:5672',
};

describe('parseAppConfig', () => {
  it('parses typed application config', () => {
    const config = parseAppConfig(validEnv);

    expect(config.nodeEnv).toBe('test');
    expect(config.runtimeProfile).toBe('deterministic-test');
    expect(config.port).toBe(3001);
    expect(config.kafkaBrokers).toEqual(['localhost:9092', 'localhost:9094']);
  });

  it('rejects invalid runtime config', () => {
    expect(() =>
      parseAppConfig({
        ...validEnv,
        DATABASE_URL: 'not-a-url',
      }),
    ).toThrow();
  });

  it('defaults staging and production to the durable beta profile', () => {
    expect(resolveRuntimeProfile({ NODE_ENV: 'staging' })).toBe('beta');
    expect(resolveRuntimeProfile({ NODE_ENV: 'production' })).toBe('beta');
  });

  it('keeps in-memory profiles scoped to dev and test', () => {
    expect(validateRuntimeProfile({ NODE_ENV: 'production', SOCIAL_MONITOR_RUNTIME_PROFILE: 'local-dev' }).violations)
      .toContain('local-dev runtime profile is allowed only with NODE_ENV=development');

    expect(validateRuntimeProfile({ NODE_ENV: 'development', SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta' })).toEqual(
      expect.objectContaining({
        durableRequired: true,
        violations: [],
      }),
    );
  });

  it('rejects non-durable modes in beta runtime', () => {
    expect(() =>
      assertRuntimeProfileAllowsMode({
        env: { SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta' },
        settingName: 'SUMMARY_JOB_QUEUE_MODE',
        selectedMode: 'in-memory',
        durableModes: ['rabbitmq'],
      }),
    ).toThrow('SUMMARY_JOB_QUEUE_MODE=in-memory is not allowed when SOCIAL_MONITOR_RUNTIME_PROFILE=beta');

    expect(() =>
      assertRuntimeProfileAllowsMode({
        env: { SOCIAL_MONITOR_RUNTIME_PROFILE: 'beta' },
        settingName: 'SUMMARY_JOB_QUEUE_MODE',
        selectedMode: 'rabbitmq',
        durableModes: ['rabbitmq'],
      }),
    ).not.toThrow();
  });
});
