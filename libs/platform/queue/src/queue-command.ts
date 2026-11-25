export type QueueCommandEnvelope<TPayload extends Readonly<Record<string, unknown>>> = {
  readonly commandId: string;
  readonly commandType: string;
  readonly schemaVersion: number;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly payload: TPayload;
};

export interface QueuePublisherPort {
  publish<TPayload extends Readonly<Record<string, unknown>>>(
    command: QueueCommandEnvelope<TPayload>,
  ): Promise<void>;
}
