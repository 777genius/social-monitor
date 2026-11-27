import type { ConfirmChannel, Message } from 'amqplib';
import { DomainError } from '@social-monitor/shared-kernel';

import type { RabbitMqPublishOptions } from './rabbitmq-queue-publisher';

type Publication = {
  readonly channel: ConfirmChannel;
  readonly outcome: Promise<void>;
  readonly confirm: (error?: unknown) => void;
  returned?: string;
};

export type RabbitMqPublicationProgressOptions = {
  readonly confirmationTimeoutMs: number;
  readonly flowControlTimeoutMs: number;
  readonly retireChannel: (channel: ConfirmChannel) => void;
};

/** Owns exact-send confirms and native write flow control, without a payload queue. */
export class RabbitMqPublicationTracker {
  private readonly publications = new Map<string, Publication>();
  private readonly closedChannels = new WeakSet<ConfirmChannel>();
  private readonly flowControl = new Map<ConfirmChannel, NodeJS.Timeout>();

  constructor(private readonly progress: RabbitMqPublicationProgressOptions) {}

  isClosed(channel: ConfirmChannel): boolean {
    return this.closedChannels.has(channel);
  }

  async publishAndConfirm(
    channel: ConfirmChannel,
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: RabbitMqPublishOptions,
  ): Promise<boolean> {
    if (this.isClosed(channel)) throw new Error('RabbitMQ publication channel closed');
    const key = publicationKey(exchange, routingKey, options.messageId);
    // A second send with the same identity cannot share mandatory-return correlation.
    if (this.publications.has(key)) throw new Error('RabbitMQ publication already pending');
    if (this.flowControl.has(channel)) {
      throw new DomainError('operation.backpressure', 'RabbitMQ publication is waiting for buffer drain');
    }
    let confirm!: (error?: unknown) => void;
    const outcome = new Promise<void>((resolve, reject) => {
      confirm = (error) => error == null ? resolve() : reject(error);
    });
    // Synchronous native callbacks and cancellation always have a rejection observer.
    void outcome.catch(() => undefined);
    const publication: Publication = { channel, outcome, confirm };
    this.publications.set(key, publication);
    const deadline = setTimeout(() => {
      confirm(new Error('RabbitMQ publication confirmation timed out; delivery outcome is unknown'));
      this.progress.retireChannel(channel);
    }, this.progress.confirmationTimeoutMs);
    deadline.unref();
    try {
      const writable = channel.publish(exchange, routingKey, content, options, confirm);
      // false means bytes were accepted into a full local buffer, not a broker nack.
      if (!writable && !this.isClosed(channel)) this.awaitDrain(channel);
      await outcome;
      if (publication.returned !== undefined) throw new Error(publication.returned);
      return writable;
    } catch (error) {
      confirm(error);
      throw error;
    } finally {
      clearTimeout(deadline);
      if (this.publications.get(key) === publication) this.publications.delete(key);
    }
  }

  drained(channel: ConfirmChannel): void {
    const deadline = this.flowControl.get(channel);
    if (deadline !== undefined) clearTimeout(deadline);
    this.flowControl.delete(channel);
  }

  returned(channel: ConfirmChannel, message: Message): void {
    const { exchange, routingKey } = message.fields;
    const messageId = String(message.properties.messageId ?? '');
    const publication = this.publications.get(publicationKey(exchange, routingKey, messageId));
    if (publication?.channel !== channel) return;
    const fields = message.fields as Message['fields'] & { replyCode?: number; replyText?: string };
    publication.returned = 'RabbitMQ mandatory publish returned: exchange=' + exchange
      + ' routingKey=' + routingKey + ' messageId=' + messageId
      + ' replyCode=' + (fields.replyCode ?? 'unknown') + ' replyText=' + (fields.replyText ?? 'unknown');
  }

  close(channel: ConfirmChannel): void {
    this.closedChannels.add(channel);
    this.drained(channel);
    for (const [key, publication] of this.publications) {
      if (publication.channel === channel) {
        publication.confirm(new Error('RabbitMQ publication channel closed before confirmation'));
        // Late callbacks hold only their own outcome, never the replacement send.
        this.publications.delete(key);
      }
    }
  }

  cancel(): void {
    for (const publication of this.publications.values()) {
      publication.confirm(new Error('RabbitMQ publication confirmation cancelled'));
    }
    this.publications.clear();
    for (const channel of this.flowControl.keys()) this.drained(channel);
  }

  private awaitDrain(channel: ConfirmChannel): void {
    if (this.flowControl.has(channel)) return;
    const deadline = setTimeout(() => {
      // The preceding send may already be confirmed. Retiring this origin only
      // affects future admission and any other still-unconfirmed publications.
      this.progress.retireChannel(channel);
    }, this.progress.flowControlTimeoutMs);
    deadline.unref();
    this.flowControl.set(channel, deadline);
  }
}

const publicationKey = (exchange: string, routingKey: string, messageId: string): string =>
  JSON.stringify([exchange, routingKey, messageId]);
