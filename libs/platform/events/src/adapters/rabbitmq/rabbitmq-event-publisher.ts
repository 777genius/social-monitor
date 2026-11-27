import type { RabbitMqQueueChannelPort } from '@social-monitor/platform-queue/adapters/rabbitmq';
import type { EventEnvelope } from '@social-monitor/shared-kernel';

import type { EventPublisherPort } from '../../outbox-dispatcher';

type RabbitMqFieldValue = string | number | boolean;

export type RabbitMqEventPublisherOptions = {
  readonly exchange: string;
  readonly exchangeType?: 'direct' | 'topic';
  readonly durable?: boolean;
  readonly persistent?: boolean;
  readonly mandatory?: boolean;
  readonly contentType?: string;
  readonly maxPayloadBytes?: number;
  readonly headers?: Readonly<Record<string, RabbitMqFieldValue>>;
};

export class RabbitMqEventPublisher implements EventPublisherPort {
  constructor(
    private readonly channel: RabbitMqQueueChannelPort,
    private readonly options: RabbitMqEventPublisherOptions,
  ) {
    if (options.exchange.trim().length === 0) {
      throw new Error('RabbitMQ event exchange must be non-empty');
    }
  }

  async publish(event: EventEnvelope<Readonly<Record<string, unknown>>>): Promise<void> {
    await this.ensureExchange();

    const content = Buffer.from(JSON.stringify(serializeEvent(event)), 'utf8');
    const maxPayloadBytes = this.options.maxPayloadBytes ?? 262_144;

    if (content.byteLength > maxPayloadBytes) {
      throw new Error(`Event payload exceeds RabbitMQ max payload size: ${content.byteLength}`);
    }

    await this.channel.publishAndConfirm(this.options.exchange, event.eventType, content, {
      contentType: this.options.contentType ?? 'application/json',
      deliveryMode: this.options.persistent === false ? 1 : 2,
      mandatory: this.options.mandatory ?? true,
      messageId: event.eventId,
      correlationId: event.correlationId,
      type: event.eventType,
      timestamp: Math.floor(event.occurredAt.getTime() / 1000),
      headers: {
        event_type: event.eventType,
        schema_version: event.schemaVersion,
        ...(event.tenantId === undefined ? {} : { tenant_id: event.tenantId }),
        ...(event.workspaceId === undefined ? {} : { workspace_id: event.workspaceId }),
        ...(event.causationId === undefined ? {} : { causation_id: event.causationId }),
        ...this.options.headers,
      },
    });
  }

  private async ensureExchange(): Promise<void> {
    await this.channel.assertExchange(this.options.exchange, this.options.exchangeType ?? 'topic', {
      durable: this.options.durable ?? true,
    });
  }
}

const serializeEvent = (
  event: EventEnvelope<Readonly<Record<string, unknown>>>,
): Readonly<Record<string, unknown>> => ({
  eventId: event.eventId,
  eventType: event.eventType,
  schemaVersion: event.schemaVersion,
  occurredAt: event.occurredAt.toISOString(),
  tenantId: event.tenantId,
  workspaceId: event.workspaceId,
  correlationId: event.correlationId,
  causationId: event.causationId,
  payload: event.payload,
});
