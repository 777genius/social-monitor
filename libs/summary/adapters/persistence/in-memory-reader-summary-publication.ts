import { canReaderSummaryGenerationSupersede } from "../../domain";
import type {
  ReaderSummaryPublicationCommand,
  ReaderSummaryPublicationOutcome,
  ReaderSummaryPublicationPort,
  SummaryEventPublisherPort,
} from "../../ports";
import type { InMemorySummaryEventPublisher } from "../messaging/in-memory-summary-event-publisher";
import type { InMemoryReaderSummaryArtifactRepository } from "./in-memory-reader-summary-artifact.repository";
import type { InMemoryReaderSummaryJobRepository } from "./in-memory-reader-summary-job.repository";
import { buildReaderSummaryPublicationPayload } from "./reader-summary-publication-proof";

type CurrentPublication = Readonly<{
  requestedAt: Date;
  modelVersion: string;
}>;
type StoredPublicationProof = Readonly<{
  proofSha256: string;
  eventId: string;
}>;

export class InMemoryReaderSummaryPublication
  implements ReaderSummaryPublicationPort
{
  private readonly proofByJobId = new Map<string, StoredPublicationProof>();
  private readonly currentBySlot = new Map<string, CurrentPublication>();
  private publicationTail = Promise.resolve();

  constructor(
    private readonly jobs: InMemoryReaderSummaryJobRepository,
    private readonly artifacts: InMemoryReaderSummaryArtifactRepository,
    private readonly events: InMemorySummaryEventPublisher | SummaryEventPublisherPort,
  ) {}

  async publish(
    command: ReaderSummaryPublicationCommand,
  ): Promise<ReaderSummaryPublicationOutcome> {
    const previous = this.publicationTail;
    let release = (): void => undefined;
    this.publicationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await this.publishLocked(command);
    } finally {
      release();
    }
  }

  private async publishLocked(
    command: ReaderSummaryPublicationCommand,
  ): Promise<ReaderSummaryPublicationOutcome> {
    const payload = buildReaderSummaryPublicationPayload(command);
    const replayProof = this.proofByJobId.get(payload.readerSummaryJobId);
    if (replayProof !== undefined) {
      if (
        replayProof.proofSha256 !== payload.proofSha256 ||
        replayProof.eventId !== command.readyEvent.eventId
      ) {
        throw new Error("Reader summary publication idempotency conflict");
      }
      return "replayed";
    }

    const slotKey = [
      payload.tenantId,
      payload.workspaceId,
      payload.scopeType,
      payload.scopeKey,
      payload.cadence,
      payload.periodStartedAt,
      payload.periodEndedAt,
      payload.periodTimezone,
    ].join(":");
    const current = this.currentBySlot.get(slotKey);
    if (
      current !== undefined &&
      !canReaderSummaryGenerationSupersede({
        incomingModelVersion: payload.modelVersion,
        visibleModelVersion: current.modelVersion,
        incomingRequestedAt: new Date(payload.requestedAt),
        visibleRequestedAt: current.requestedAt,
      })
    ) {
      return "stale";
    }

    // The concrete in-memory collaborators cannot throw after their writes.
    // Publish the only fallible outer collaborator first and expose the
    // artifact last so an event failure can never leave a visible summary.
    await this.events.publish(command.readyEvent);
    await this.jobs.save(command.finalJob);
    this.artifacts.commitPublication(command.artifact);
    this.proofByJobId.set(payload.readerSummaryJobId, {
      proofSha256: payload.proofSha256,
      eventId: command.readyEvent.eventId,
    });
    this.currentBySlot.set(slotKey, {
      requestedAt: new Date(payload.requestedAt),
      modelVersion: payload.modelVersion,
    });

    return "published";
  }
}
