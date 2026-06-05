export interface InboxStorePort {
  hasProcessed(params: { consumerName: string; eventId: string }): Promise<boolean>;
  markProcessed(params: { consumerName: string; eventId: string; schemaVersion: number }): Promise<void>;
}

export class InboxDeduplicator {
  constructor(private readonly inbox: InboxStorePort) {}

  async runOnce(params: {
    readonly consumerName: string;
    readonly eventId: string;
    readonly schemaVersion: number;
    readonly handler: () => Promise<void>;
  }): Promise<{ readonly processed: boolean }> {
    const alreadyProcessed = await this.inbox.hasProcessed({
      consumerName: params.consumerName,
      eventId: params.eventId,
    });

    if (alreadyProcessed) {
      return { processed: false };
    }

    await params.handler();
    await this.inbox.markProcessed({
      consumerName: params.consumerName,
      eventId: params.eventId,
      schemaVersion: params.schemaVersion,
    });

    return { processed: true };
  }
}
