import type { Provider } from "@nestjs/common";
import { InMemoryMetricsRecorder } from "@social-monitor/platform-metrics";
import { type QueuePublisherPort } from "@social-monitor/platform-queue";
import { InMemoryQueuePublisher } from "@social-monitor/platform-queue/adapters/in-memory";
import {
  AmqplibRabbitMqChannel,
  parseRabbitMqDeadLetterExchange,
  parseRabbitMqDeliveryLimit,
  parseRabbitMqQueueType,
  RabbitMqQueuePublisher,
} from "@social-monitor/platform-queue/adapters/rabbitmq";
import { SystemClock } from "@social-monitor/shared-kernel";

import { InMemoryScanQueueAdapter } from "../../adapters/queue/in-memory-scan-queue.adapter";
import type { ScanQueuePort } from "../../ports";
import {
  MONITORING_SCAN_QUEUE,
  MONITORING_SCAN_QUEUE_MODE,
  type MonitoringScanQueueMode,
} from "./monitoring-provider-tokens";

const MONITORING_RABBITMQ_CHANNEL = Symbol("MONITORING_RABBITMQ_CHANNEL");
const MONITORING_QUEUE_PUBLISHER = Symbol("MONITORING_QUEUE_PUBLISHER");

export const monitoringScanQueueProviders = (
  env: NodeJS.ProcessEnv,
): Provider[] => [
  InMemoryQueuePublisher,
  InMemoryMetricsRecorder,
  {
    provide: MONITORING_RABBITMQ_CHANNEL,
    useFactory: (
      mode: MonitoringScanQueueMode,
    ): AmqplibRabbitMqChannel | null =>
      mode === "rabbitmq"
        ? new AmqplibRabbitMqChannel({ url: env.RABBITMQ_URL ?? "" })
        : null,
    inject: [MONITORING_SCAN_QUEUE_MODE],
  },
  {
    provide: MONITORING_QUEUE_PUBLISHER,
    useFactory: (
      mode: MonitoringScanQueueMode,
      inMemoryPublisher: InMemoryQueuePublisher,
      rabbitMqChannel: AmqplibRabbitMqChannel | null,
    ): QueuePublisherPort =>
      mode === "rabbitmq"
        ? new RabbitMqQueuePublisher(
            requireRabbitMqChannel(rabbitMqChannel),
            monitoringScanQueueRabbitMqOptions(env),
            new SystemClock(),
          )
        : inMemoryPublisher,
    inject: [
      MONITORING_SCAN_QUEUE_MODE,
      InMemoryQueuePublisher,
      MONITORING_RABBITMQ_CHANNEL,
    ],
  },
  {
    provide: MONITORING_SCAN_QUEUE,
    useFactory: (
      publisher: QueuePublisherPort,
      metrics: InMemoryMetricsRecorder,
    ): ScanQueuePort => new InMemoryScanQueueAdapter(publisher, metrics),
    inject: [MONITORING_QUEUE_PUBLISHER, InMemoryMetricsRecorder],
  },
];

const requireRabbitMqChannel = (
  channel: AmqplibRabbitMqChannel | null,
): AmqplibRabbitMqChannel => {
  if (channel === null) {
    throw new Error("RabbitMQ scan queue channel was not configured");
  }

  return channel;
};

const monitoringScanQueueRabbitMqOptions = (env: NodeJS.ProcessEnv) => ({
  exchange: envValue(env.RABBITMQ_COMMAND_EXCHANGE, "social-monitor.jobs"),
  routes: {
    "ingestion.scan.execute": {
      queue: envValue(env.RABBITMQ_SCAN_QUEUE, "jobs.freshness.scan"),
      routingKey: envValue(env.RABBITMQ_SCAN_ROUTING_KEY, "scan.execute"),
      deadLetterExchange: parseRabbitMqDeadLetterExchange(
        env.RABBITMQ_DEAD_LETTER_EXCHANGE,
        {
          runtimeProfile: env.SOCIAL_MONITOR_RUNTIME_PROFILE,
          settingName: "MONITORING_SCAN_QUEUE=rabbitmq",
        },
      ),
      queueType: parseRabbitMqQueueType(env.RABBITMQ_QUEUE_TYPE),
      deliveryLimit: parseRabbitMqDeliveryLimit(
        env.RABBITMQ_QUEUE_DELIVERY_LIMIT,
      ),
    },
  },
});

const envValue = (value: string | undefined, fallback: string): string => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
};
