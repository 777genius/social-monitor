import { Inject, Injectable } from '@nestjs/common';
import type { QueueCommandDelivery as PlatformCommandDelivery, QueueCommandReader } from '@social-monitor/platform-queue';
import { InMemoryQueueCommandReader, InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { RabbitMqQueueCommandReader, type RabbitMqCommandReaderChannel } from '@social-monitor/platform-queue/adapters/rabbitmq';

import { INGESTION_RABBITMQ_SCAN_QUEUE_READER_OPTIONS, type IngestionRabbitMqScanQueueReaderOptions } from './ingestion-worker-provider-tokens';

export const INGESTION_SCAN_COMMAND_QUEUE_READER = Symbol('INGESTION_SCAN_COMMAND_QUEUE_READER');

export type QueueCommandDelivery = PlatformCommandDelivery;
export type ScanCommandQueueReaderPort = QueueCommandReader;
export type RabbitMqScanQueueReaderChannelPort = RabbitMqCommandReaderChannel;

@Injectable()
export class InMemoryScanCommandQueueReader extends InMemoryQueueCommandReader {
  constructor(queue: InMemoryQueuePublisher) { super(queue); }
}

@Injectable()
export class RabbitMqScanCommandQueueReader extends RabbitMqQueueCommandReader {
  constructor(channel: RabbitMqScanQueueReaderChannelPort,
    @Inject(INGESTION_RABBITMQ_SCAN_QUEUE_READER_OPTIONS) options: IngestionRabbitMqScanQueueReaderOptions) {
    super(channel, options);
  }
}
