import type { EventEnvelope } from "@social-monitor/shared-kernel";

import type { SummaryEventPublisherPort } from "../../ports";

export class ReaderSummaryLegacyEventPublisherAdapter implements SummaryEventPublisherPort {
  constructor(private readonly delegate: SummaryEventPublisherPort) {}

  async publish(
    event: EventEnvelope<Readonly<Record<string, unknown>>>,
  ): Promise<void> {
    await this.delegate.publish(
      event.eventType === "reader_summary.ready"
        ? toLegacyReadyEvent(event)
        : event,
    );
  }
}

const toLegacyReadyEvent = (
  event: EventEnvelope<Readonly<Record<string, unknown>>>,
): EventEnvelope<Readonly<Record<string, unknown>>> => {
  const payload = event.payload as {
    readonly readerSummaryJobId?: string;
    readonly readerSummaryId?: string;
  } & Readonly<Record<string, unknown>>;
  const { readerSummaryJobId, readerSummaryId, ...rest } = payload;

  return {
    ...event,
    eventType: "briefing.ready",
    schemaVersion: 1,
    payload: {
      ...rest,
      briefingJobId: readerSummaryJobId,
      briefingId: readerSummaryId,
    },
  };
};
