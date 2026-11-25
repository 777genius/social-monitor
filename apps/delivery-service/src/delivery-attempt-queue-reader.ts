import { Inject, Injectable } from '@nestjs/common';
import type { QueueCommandDelivery as PlatformCommandDelivery, QueueCommandReader } from '@social-monitor/platform-queue';
import { InMemoryQueueCommandReader, InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { RabbitMqQueueCommandReader, type RabbitMqCommandReaderChannel } from '@social-monitor/platform-queue/adapters/rabbitmq';

import { DELIVERY_RABBITMQ_ATTEMPT_QUEUE_READER_OPTIONS, type DeliveryRabbitMqAttemptQueueReaderOptions } from './delivery-service-provider-tokens';

export const DELIVERY_ATTEMPT_COMMAND_QUEUE_READER = Symbol('DELIVERY_ATTEMPT_COMMAND_QUEUE_READER');

export type DeliveryAttemptCommandDelivery = PlatformCommandDelivery;
export type DeliveryAttemptQueueReaderPort = QueueCommandReader;
export type RabbitMqDeliveryAttemptQueueReaderChannelPort = RabbitMqCommandReaderChannel;

@Injectable()
export class InMemoryDeliveryAttemptQueueReader extends InMemoryQueueCommandReader {
  constructor(queue: InMemoryQueuePublisher) { super(queue); }
}

@Injectable()
export class RabbitMqDeliveryAttemptQueueReader extends RabbitMqQueueCommandReader {
  constructor(channel: RabbitMqDeliveryAttemptQueueReaderChannelPort,
    @Inject(DELIVERY_RABBITMQ_ATTEMPT_QUEUE_READER_OPTIONS) options: DeliveryRabbitMqAttemptQueueReaderOptions) {
    super(channel, options);
  }
}
