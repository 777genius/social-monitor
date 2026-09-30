import type { ReaderValueAssessmentStore } from
  "@social-monitor/relevance/application/contracts/reader-value-assessment-store";
import type { ReaderValueSummaryPreparation } from
  "@social-monitor/relevance/application/contracts/reader-value-summary-preparation";
import type { ReaderValueWorkspaceInterests } from
  "@social-monitor/relevance/application/contracts/reader-value-workspace-interests";
import { validateReaderValueAnswers } from
  "@social-monitor/relevance/domain/reader-value/reader-value-assessment";
import { createHash } from "node:crypto";

import type {
  ReaderSummaryV3Coverage,
  ReaderSummaryV3PreparationSourcePort,
} from "../../ports";
import { compareReaderSummaryPreparationTimestamps,
  canonicalReaderSummaryPreparationTimestamp,
  readerSummaryWorkspaceManifestSha256,
  sameReaderSummaryPreparationConfig,
  sameReaderSummaryPreparationIdentity } from "../../domain";

export class RelevanceReaderSummaryV3PreparationSource
implements ReaderSummaryV3PreparationSourcePort {
  constructor(
    private readonly preparation: ReaderValueSummaryPreparation,
    private readonly assessments: Pick<ReaderValueAssessmentStore, "read">,
    private readonly workspaceInterests?: ReaderValueWorkspaceInterests,
  ) {}

  async configuration(
    job: Parameters<ReaderSummaryV3PreparationSourcePort["configuration"]>[0],
  ): ReturnType<ReaderSummaryV3PreparationSourcePort["configuration"]> {
    const snapshot = job.toSnapshot();
    if (snapshot.scope.type === "interest") {
      return this.preparation.configuration(command(snapshot, snapshot.scope.interestId));
    }
    if (this.workspaceInterests === undefined) return { ok: false, code: "config_unavailable" };
    const enabled = [...await this.workspaceInterests.listEnabled(snapshot, 32)]
      .sort((left, right) => Buffer.compare(Buffer.from(left.interestId, "utf8"),
        Buffer.from(right.interestId, "utf8")));
    if (enabled.length > 32) {
      return { ok: false, code: "assessment_inventory_over_budget" };
    }
    if (enabled.length === 0 || enabled.some((entry) =>
      entry.interestId.trim().length === 0 || entry.query.trim().length === 0) ||
      enabled.some((entry, index) => index > 0 &&
        entry.interestId === enabled[index - 1]?.interestId)) {
      return { ok: false, code: "config_unavailable" };
    }
    const interests = [];
    for (const entry of enabled) {
      const current = await this.preparation.configuration(command(snapshot, entry.interestId));
      if (!current.ok || current.config.interestSha256 !== sha256(entry.query)) {
        return { ok: false, code: "config_unavailable" };
      }
      interests.push(current.config);
    }
    return { ok: true, config: { schemaVersion: "reader_summary_preparation_config.v2",
      interests } };
  }

  async prepare(
    job: Parameters<ReaderSummaryV3PreparationSourcePort["prepare"]>[0],
    config: Parameters<ReaderSummaryV3PreparationSourcePort["prepare"]>[1],
  ): ReturnType<ReaderSummaryV3PreparationSourcePort["prepare"]> {
    const snapshot = job.toSnapshot();
    if (snapshot.scope.type === "interest") {
      if (config.schemaVersion !== "reader_summary_preparation_config.v1") {
        return { ok: false, code: "config_unavailable" };
      }
      return this.preparation.prepare(command(snapshot, snapshot.scope.interestId), config);
    }
    if (config.schemaVersion !== "reader_summary_preparation_config.v2") {
      return { ok: false, code: "config_unavailable" };
    }
    const current = await this.configuration(job);
    if (!current.ok) return current;
    if (!sameReaderSummaryPreparationConfig(current.config, config)) {
      return { ok: false, code: "config_unavailable" };
    }
    const candidates = [];
    let count = 0;
    let sourceBytes = 0;
    for (const frozen of config.interests) {
      const frozenCutoff = command(snapshot, frozen.interestId).cutoffAt;
      const result = await this.preparation.prepare({
        ...command(snapshot, frozen.interestId),
        requireRetentionCompleteness: true,
        candidateBudget: 20_000 - count,
        sourceByteBudget: Math.min(32 * 1024 * 1024,
          128 * 1024 * 1024 - sourceBytes),
      }, frozen);
      if (!result.ok) return result;
      if (!sameReaderSummaryPreparationIdentity(frozen, result.config,
          result.manifest) ||
          canonicalReaderSummaryPreparationTimestamp(
            result.manifest.cutoffAt) !== frozenCutoff) {
        return { ok: false, code: "config_unavailable" };
      }
      count += result.manifest.candidates.length;
      sourceBytes += result.sourceBytes;
      if (count > 20_000) return { ok: false, code: "assessment_inventory_over_budget" };
      if (sourceBytes > 128 * 1024 * 1024) {
        return { ok: false, code: "assessment_inventory_over_budget" };
      }
      candidates.push(...result.manifest.candidates.map((candidate) => ({
        ...candidate, interestId: frozen.interestId })));
    }
    const manifest = { schemaVersion: "reader_summary_preparation_manifest.v2" as const,
      cutoffAt: command(snapshot, config.interests[0]!.interestId).cutoffAt,
      periodKey: snapshot.period.periodKey,
      interests: config.interests, candidates };
    const encoded = JSON.stringify(manifest);
    if (Buffer.byteLength(encoded, "utf8") > 16 * 1024 * 1024) {
      return { ok: false, code: "assessment_inventory_over_budget" };
    }
    return { ok: true, config, manifest,
      manifestSha256: readerSummaryWorkspaceManifestSha256(manifest) };
  }

  async coverage(params: Parameters<ReaderSummaryV3PreparationSourcePort["coverage"]>[0]):
  Promise<ReaderSummaryV3Coverage> {
    const snapshot = params.job.toSnapshot();
    const current = await this.configuration(params.job);
    if (!current.ok || snapshot.preparationConfig === undefined ||
        !sameReaderSummaryPreparationConfig(current.config,
          snapshot.preparationConfig) ||
        params.manifest.schemaVersion === "reader_summary_preparation_manifest.v2" &&
        !sameReaderSummaryPreparationIdentity(snapshot.preparationConfig,
          current.config, params.manifest) ||
        params.manifest.schemaVersion === "reader_summary_preparation_manifest.v2" &&
        (snapshot.preparationCutoffAt === undefined ||
          canonicalReaderSummaryPreparationTimestamp(
            params.manifest.cutoffAt) !== snapshot.preparationCutoffAt)) {
      return { status: "unavailable", code: current.ok ? "config_unavailable" :
        current.code };
    }
    const manifest = params.manifest;
    if (manifest.schemaVersion === "reader_summary_preparation_manifest.v2" &&
        manifest.periodKey !== snapshot.period.periodKey) {
      return { status: "unavailable", code: "config_unavailable" };
    }
    const entries = manifest.schemaVersion === "reader_summary_preparation_manifest.v2"
      ? manifest.interests.map((config) => ({
        interestId: config.interestId, config,
        candidates: manifest.candidates.filter(
          (candidate) => candidate.interestId === config.interestId) }))
      : snapshot.scope.type === "interest"
        ? [{ interestId: snapshot.scope.interestId,
          config: undefined, candidates: manifest.candidates }]
        : [];
    if (entries.length === 0) return { status: "unavailable", code: "config_unavailable" };
    const reads = [];
    let hasPromotableSignal = false;
    for (const entry of entries) {
      for (let offset = 0; offset < entry.candidates.length; offset += 100) {
        const batch = entry.candidates.slice(offset, offset + 100);
        const result = await this.assessments.read(
          { tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId },
          entry.interestId, batch.map((candidate) => ({
        assessmentId: candidate.assessmentId,
        feedItemId: candidate.candidateId,
        sourceBindingId: manifest.schemaVersion ===
          "reader_summary_preparation_manifest.v2"
          ? candidate.sourceBindingId : undefined,
        sourceSnapshotSha256: candidate.sourceSnapshotSha256,
        inputSha256: candidate.inputSha256,
          })));
        if (result.length !== batch.length) {
          return { status: "unavailable", code: "assessment_unavailable" };
        }
        if (entry.config !== undefined && result.some((read, index) => {
          if (read.status !== "available" || read.assessment.state !== "assessed") {
            return false;
          }
          const candidate = batch[index]!;
          const input = read.assessment.input;
          return read.assessment.id !== candidate.assessmentId ||
            input.interestId !== entry.interestId ||
            input.sourceItemId !== candidate.sourceItemId ||
            input.sourceRevisionKey !== candidate.sourceRevisionKey ||
            input.sourceSnapshotSha256 !== candidate.sourceSnapshotSha256 ||
            input.inputSha256 !== candidate.inputSha256 ||
            input.interestSha256 !== entry.config.interestSha256 ||
            input.rubricVersion !== entry.config.rubricVersion ||
            input.rubricSha256 !== entry.config.rubricSha256 ||
            input.inputBuilderVersion !== entry.config.inputBuilderVersion ||
            input.modelConfigVersion !== entry.config.modelConfigVersion ||
            !validateReaderValueAnswers(read.assessment.answers).ok;
        })) {
          return { status: "unavailable", code: "assessment_unavailable" };
        }
        if (manifest.schemaVersion === "reader_summary_preparation_manifest.v2") {
          hasPromotableSignal ||= result.some((read, index) => {
            const candidate = batch[index]!;
            if (read.status !== "available" || read.assessment.answers === null ||
                read.assessment.state !== "assessed") return false;
            const answers = read.assessment.answers;
            const published = Date.parse(candidate.publishedAt);
            return (answers.usefulness.choice === "useful" ||
                answers.usefulness.choice === "important") &&
              (answers.relevance.choice === "relevant" ||
                answers.relevance.choice === "central") &&
              candidate.sourceKind !== "trending_repository" &&
              Number.isFinite(published) &&
              published >= snapshot.period.startedAt.getTime() &&
              published < snapshot.period.endedAt.getTime() &&
              read.assessment.input.snapshot.safety !== "blocked";
          });
        }
        reads.push(...result);
      }
    }
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
      ? { status: "ready", ...(manifest.schemaVersion ===
          "reader_summary_preparation_manifest.v2" ? { hasPromotableSignal } : {}) }
      : { status: "pending" };
  }
}

const command = (snapshot: ReturnType<Parameters<
ReaderSummaryV3PreparationSourcePort["prepare"]>[0]["toSnapshot"]>, interestId: string) => {
  return { tenantId: snapshot.tenantId, workspaceId: snapshot.workspaceId,
    interestId, jobId: snapshot.id,
    periodStartedAt: snapshot.period.startedAt.toISOString(),
    periodEndedAt: snapshot.period.endedAt.toISOString(),
    ...(snapshot.preparationDeadlineAt === undefined ? {} : {
      deadlineAt: snapshot.preparationDeadlineAt }),
    cutoffAt: snapshot.preparationCutoffAt ??
      snapshot.requestedAt.toISOString().replace(/\.(\d{3})Z$/u, ".$1000Z") };
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");
