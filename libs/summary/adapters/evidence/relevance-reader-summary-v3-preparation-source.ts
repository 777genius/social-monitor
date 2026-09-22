import type { ReaderValueAssessmentStore } from
  "@social-monitor/relevance/application/contracts/reader-value-assessment-store";
import type { ReaderValueSummaryPreparation } from
  "@social-monitor/relevance/application/contracts/reader-value-summary-preparation";

import type {
  ReaderSummaryV3Coverage,
  ReaderSummaryV3PreparationSourcePort,
} from "../../ports";
import { compareReaderSummaryPreparationTimestamps } from "../../domain";

export class RelevanceReaderSummaryV3PreparationSource
implements ReaderSummaryV3PreparationSourcePort {
  constructor(
    private readonly preparation: ReaderValueSummaryPreparation,
    private readonly assessments: Pick<ReaderValueAssessmentStore, "read">,
  ) {}

  async configuration(
    job: Parameters<ReaderSummaryV3PreparationSourcePort["configuration"]>[0],
  ): ReturnType<ReaderSummaryV3PreparationSourcePort["configuration"]> {
    const snapshot = job.toSnapshot();
    if (snapshot.scope.type !== "interest") {
      return { ok: false, code: "config_unavailable" };
    }
    return this.preparation.configuration(command(snapshot));
  }

  async prepare(
    job: Parameters<ReaderSummaryV3PreparationSourcePort["prepare"]>[0],
    config: Parameters<ReaderSummaryV3PreparationSourcePort["prepare"]>[1],
  ): ReturnType<ReaderSummaryV3PreparationSourcePort["prepare"]> {
    const snapshot = job.toSnapshot();
    if (snapshot.scope.type !== "interest") {
      return { ok: false, code: "config_unavailable" };
    }
    return this.preparation.prepare(command(snapshot), config);
  }

  async coverage(params: Parameters<ReaderSummaryV3PreparationSourcePort["coverage"]>[0]):
  Promise<ReaderSummaryV3Coverage> {
    const snapshot = params.job.toSnapshot();
    if (snapshot.scope.type !== "interest") {
      return { status: "unavailable", code: "config_unavailable" };
    }
    const reads = await this.assessments.read(
      { tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId },
      snapshot.scope.interestId,
      params.manifest.candidates.map((candidate) => ({
        assessmentId: candidate.assessmentId,
        feedItemId: candidate.candidateId,
        sourceSnapshotSha256: candidate.sourceSnapshotSha256,
        inputSha256: candidate.inputSha256,
      })),
    );
    if (reads.some((read) => read.status !== "available")) {
      return { status: "unavailable", code: "assessment_unavailable" };
    }
    if (reads.some((read) => read.status === "available" &&
        read.assessment.state === "permanent_failed")) {
      return { status: "unavailable", code: "assessment_unavailable" };
    }
    return reads.every((read) => read.status === "available" &&
      read.assessment.state === "assessed" && read.assessment.assessedAt !== null &&
      compareReaderSummaryPreparationTimestamps(
        read.assessment.assessedAt,
        params.deadlineAt,
      ) <= 0)
      ? { status: "ready" }
      : { status: "pending" };
  }
}

const command = (snapshot: ReturnType<Parameters<
ReaderSummaryV3PreparationSourcePort["prepare"]>[0]["toSnapshot"]>) => {
  if (snapshot.scope.type !== "interest") {
    throw new Error("V3 preparation requires interest scope");
  }
  return { tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId,
    interestId: snapshot.scope.interestId, jobId: snapshot.id,
    periodStartedAt: snapshot.period.startedAt.toISOString(),
    periodEndedAt: snapshot.period.endedAt.toISOString(),
    cutoffAt: snapshot.preparationCutoffAt ??
      snapshot.requestedAt.toISOString().replace(/\.(\d{3})Z$/u, ".$1000Z") };
};
