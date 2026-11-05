import { Inject, Injectable } from '@nestjs/common';
import type { QueueCommandDelivery as PlatformCommandDelivery, QueueCommandReader } from '@social-monitor/platform-queue';
import { InMemoryQueueCommandReader, InMemoryQueuePublisher } from '@social-monitor/platform-queue/adapters/in-memory';
import { RabbitMqQueueCommandReader, type RabbitMqCommandReaderChannel } from '@social-monitor/platform-queue/adapters/rabbitmq';

import { INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_READER_OPTIONS, type IntelligenceRabbitMqSummaryQueueReaderOptions } from './intelligence-worker-provider-tokens';

export const INTELLIGENCE_SUMMARY_JOB_QUEUE_READER = Symbol('INTELLIGENCE_SUMMARY_JOB_QUEUE_READER');
export const INTELLIGENCE_READER_SUMMARY_JOB_QUEUE_READER = Symbol('INTELLIGENCE_READER_SUMMARY_JOB_QUEUE_READER');

export type SummaryJobCommandDelivery = PlatformCommandDelivery;
export type SummaryJobQueueReaderPort = QueueCommandReader;
export type RabbitMqSummaryQueueReaderChannelPort = RabbitMqCommandReaderChannel;

@Injectable()
export class InMemorySummaryJobQueueReader extends InMemoryQueueCommandReader {
  constructor(queue: InMemoryQueuePublisher) { super(queue); }
}

@Injectable()
export class RabbitMqSummaryJobQueueReader extends RabbitMqQueueCommandReader {
  constructor(channel: RabbitMqSummaryQueueReaderChannelPort,
    @Inject(INTELLIGENCE_RABBITMQ_SUMMARY_QUEUE_READER_OPTIONS) options: IntelligenceRabbitMqSummaryQueueReaderOptions) {
    super(channel, options);
  }
}
