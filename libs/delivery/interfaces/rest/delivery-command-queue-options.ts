import {
  parseRabbitMqDeadLetterExchange,
  parseRabbitMqDeliveryLimit,
  parseRabbitMqQueueType,
} from '@social-monitor/platform-queue/adapters/rabbitmq';

export const deliveryCommandQueueOptions = (env: NodeJS.ProcessEnv) => ({
  exchange: valueOr(env.RABBITMQ_DELIVERY_ATTEMPT_EXCHANGE, 'social-monitor.commands'),
  exchangeType: 'direct' as const,
  routes: {
    'delivery.attempt.send': {
      queue: valueOr(env.RABBITMQ_DELIVERY_ATTEMPT_QUEUE, 'jobs.delivery.attempt.send'),
      routingKey: 'delivery.attempt.send',
      deadLetterExchange: parseRabbitMqDeadLetterExchange(env.RABBITMQ_DEAD_LETTER_EXCHANGE, {
        runtimeProfile: env.SOCIAL_MONITOR_RUNTIME_PROFILE,
        settingName: 'DELIVERY_ATTEMPT_DISPATCH_QUEUE=rabbitmq',
      }),
      queueType: parseRabbitMqQueueType(env.RABBITMQ_QUEUE_TYPE),
      deliveryLimit: parseRabbitMqDeliveryLimit(env.RABBITMQ_QUEUE_DELIVERY_LIMIT),
    },
  },
});

const valueOr = (value: string | undefined, fallback: string): string => value?.trim() || fallback;
