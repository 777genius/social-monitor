import type { ConfirmChannel, Message } from 'amqplib';

import type { RabbitMqPublishOptions } from './rabbitmq-queue-publisher';

type Publication = {
  readonly channel: ConfirmChannel;
  readonly outcome: Promise<void>;
  readonly confirm: (error?: unknown) => void;
  returned?: string;
};

/** Correlates a wire send with its own broker callback, including across reconnects. */
export class RabbitMqPublicationTracker {
  private readonly publications = new Map<string, Publication>();
  private readonly closedChannels = new WeakSet<ConfirmChannel>();

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
    // A second send with the same identity cannot safely share mandatory-return
    // correlation. Distinct publications may still confirm in any order.
    if (this.publications.has(key)) throw new Error('RabbitMQ publication already pending');
    let confirm!: (error?: unknown) => void;
    const outcome = new Promise<void>((resolve, reject) => {
      confirm = (error) => error == null ? resolve() : reject(error);
    });
    // Synchronous callbacks and cancellation still have a rejection handler.
    void outcome.catch(() => undefined);
    const publication: Publication = { channel, outcome, confirm };
    this.publications.set(key, publication);
    try {
      const accepted = channel.publish(exchange, routingKey, content, options, confirm);
      // A false buffer result still hands bytes to amqplib. Keep return/confirm
      // correlation until its callback settles, before the identity is reusable.
      await outcome;
      if (publication.returned !== undefined) throw new Error(publication.returned);
      return accepted;
    } catch (error) {
      confirm(error);
      throw error;
    } finally {
      if (this.publications.get(key) === publication) this.publications.delete(key);
    }
  }

  returned(channel: ConfirmChannel, message: Message): void {
    const { exchange, routingKey } = message.fields;
    const messageId = String(message.properties.messageId ?? '');
    const publication = this.publications.get(publicationKey(exchange, routingKey, messageId));
    if (publication?.channel !== channel) return;
    const fields = message.fields as Message['fields'] & { replyCode?: number; replyText?: string };
    publication.returned = `RabbitMQ mandatory publish returned: exchange=${exchange} routingKey=${routingKey} messageId=${messageId} replyCode=${fields.replyCode ?? 'unknown'} replyText=${fields.replyText ?? 'unknown'}`;
  }

  close(channel: ConfirmChannel): void {
    this.closedChannels.add(channel);
    for (const [key, publication] of this.publications) {
      if (publication.channel === channel) {
        publication.confirm(new Error('RabbitMQ publication channel closed before confirmation'));
        // Each call already holds its own outcome; freeing this key permits a
        // retry on another generation without letting either consume the other.
        this.publications.delete(key);
      }
    }
  }

  cancel(): void {
    for (const publication of this.publications.values()) {
      publication.confirm(new Error('RabbitMQ publication confirmation cancelled'));
    }
    this.publications.clear();
  }
}

const publicationKey = (exchange: string, routingKey: string, messageId: string): string =>
  JSON.stringify([exchange, routingKey, messageId]);
