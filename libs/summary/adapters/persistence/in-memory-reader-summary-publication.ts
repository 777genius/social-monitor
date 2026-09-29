import { canReaderSummaryGenerationSupersede,
  readerSummaryWorkspaceManifestSha256,
  sameReaderSummaryPreparationConfig } from "../../domain";
import type {
  ReaderSummaryPublicationCommand,
  ReaderSummaryPublicationOutcome,
  ReaderSummaryPublicationPort,
  ReaderSummaryV3PreparationSourcePort,
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

  constructor(
    private readonly jobs: InMemoryReaderSummaryJobRepository,
    private readonly artifacts: InMemoryReaderSummaryArtifactRepository,
    private readonly events: InMemorySummaryEventPublisher | SummaryEventPublisherPort,
    private readonly v3Source?: ReaderSummaryV3PreparationSourcePort,
  ) {}

  async publish(
    command: ReaderSummaryPublicationCommand,
  ): Promise<ReaderSummaryPublicationOutcome> {
    return this.jobs.runExclusive(() => this.publishLocked(command));
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
    const durableJob = await this.jobs.findById({
      tenantId: command.finalJob.toSnapshot().tenantId,
      workspaceId: command.finalJob.toSnapshot().workspaceId,
      readerSummaryJobId: command.finalJob.toSnapshot().id,
    });
    const durable = durableJob?.toSnapshot();
    const artifactSnapshot = command.artifact.toSnapshot();
    const attestations = artifactSnapshot.promotionAttestations ?? [];
    const isNoSignal = artifactSnapshot.qualityFlags.includes("no_signal");
    if (durable?.selectionStrategy === "jev_primary_v3" && (
      durable.status !== "running" || durable.terminalFailureCode !== undefined ||
      durable.preparationManifest === undefined ||
      durable.startedAt?.getTime() !== command.finalJob.toSnapshot().startedAt?.getTime() ||
      attestations.some((attestation) =>
        attestation.schemaVersion !== "reader_post_promotion_attestation.v3") ||
      (!isNoSignal && attestations.length === 0) ||
      (isNoSignal && attestations.length !== 0)
    )) {
      throw new Error("Reader summary V3 publication guard rejected the execution fence");
    }
    if (durable?.selectionStrategy === "jev_primary_v3" &&
        durable.preparationManifest?.schemaVersion ===
          "reader_summary_preparation_manifest.v2") {
      if (this.v3Source === undefined || durableJob === null ||
          durable.preparationConfig?.schemaVersion !==
            "reader_summary_preparation_config.v2" ||
          durable.preparationManifest.periodKey !== durable.period.periodKey ||
          artifactSnapshot.period.periodKey !== durable.preparationManifest.periodKey ||
          artifactSnapshot.sourceWindow.exactIngestionCutoff !==
            durable.preparationManifest.cutoffAt ||
          durable.preparationDeadlineAt === undefined) {
        throw new Error("Workspace V3 publication readiness is unavailable");
      }
      if (durable.preparationManifestSha256 !==
          readerSummaryWorkspaceManifestSha256(durable.preparationManifest)) {
        throw new Error("Workspace V3 publication manifest digest changed");
      }
      const current = await this.v3Source.configuration(durableJob);
      const coverage = await this.v3Source.coverage({ job: durableJob,
        manifest: durable.preparationManifest,
        deadlineAt: durable.preparationDeadlineAt });
      if (!current.ok || !sameReaderSummaryPreparationConfig(current.config,
          durable.preparationConfig) || coverage.status !== "ready" ||
          (isNoSignal && coverage.hasPromotableSignal !== false)) {
        throw new Error("Workspace V3 publication scope or coverage changed");
      }
      const frozen = new Map(durable.preparationManifest.candidates.map((candidate) =>
        [candidate.candidateId, candidate] as const));
      const frozenInterests = new Map(durable.preparationConfig.interests.map(
        (interest) => [interest.interestId, interest] as const));
      if (attestations.some((attestation) => {
        const candidate = frozen.get(attestation.candidateId);
        const interest = candidate === undefined ? undefined :
          frozenInterests.get(candidate.interestId);
        return candidate === undefined || attestation.schemaVersion !==
          "reader_post_promotion_attestation.v3" ||
          interest === undefined ||
          attestation.assessment.assessmentId !== candidate.assessmentId ||
          attestation.assessment.sourceSnapshotSha256 !== candidate.sourceSnapshotSha256 ||
          attestation.assessment.inputSha256 !== candidate.inputSha256 ||
          attestation.assessment.rubricVersion !== interest.rubricVersion ||
          attestation.assessment.rubricSha256 !== interest.rubricSha256 ||
          attestation.assessment.modelConfigVersion !== interest.modelConfigVersion ||
          attestation.exactIngestionCutoff !== durable.preparationManifest!.cutoffAt;
      })) {
        throw new Error("Workspace V3 publication provenance changed");
      }
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
    const finalSnapshot = command.finalJob.toSnapshot();
    const executionSaved = await this.jobs.saveExecutionOutcome({
      job: command.finalJob,
      expectedStartedAt: finalSnapshot.startedAt!,
    });
    if (!executionSaved) {
      return "stale";
    }
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
