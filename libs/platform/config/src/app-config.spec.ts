import { parseAppConfig } from './app-config';

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
});
