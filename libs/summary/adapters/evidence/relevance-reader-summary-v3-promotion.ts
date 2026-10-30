import type {
  ReaderValueAssessmentStore,
  ReaderValueRead,
  ReaderValueReference,
} from "@social-monitor/relevance/application/contracts/reader-value-assessment-store";
import { canonicalReaderValueTimestamp } from
  "@social-monitor/relevance/domain/reader-value/canonical-reader-value-timestamp";
import { validateReaderValueAnswers } from
  "@social-monitor/relevance/domain/reader-value/reader-value-assessment";

import {
  READER_PROMOTION_PRESENTATION_BUDGET,
  readerPromotionSourceForProviderKey,
  selectGitHubTrendingSupplementalEvidence,
  selectReaderPostPromotionsV3,
  type ReaderPostPromotionV3Candidate,
  type ReaderPostPromotionV3Presentation,
  type ReaderDisplayHeadlineSeal,
  type SummaryEvidenceItem,
  compareReaderSummaryPreparationTimestamps,
} from "../../domain";
import type { PromotionPresentationBuilder,
  ReaderPostPresentationV3Input } from
  "../../domain/services/reader-post-presentation-v3";
import { READER_POST_PRESENTATION_V3_MAX_BODY_UTF16,
  READER_POST_PRESENTATION_V3_MAX_TITLE_UTF16 } from
  "../../domain/services/reader-post-presentation-v3";
import type { ReaderSummaryV3PromotionPort,
  ReaderSummarySupplementalEvidenceSelectorPort,
  ReaderSummaryV3PromotionOutcome } from "../../ports";
import { maxReaderSummaryEvidenceItems } from
  "./relevance-reader-summary-evidence-support";
import { clustersForSelection, v3EvidenceSelection } from
  "./relevance-reader-summary-v3-evidence";
import { clusteringEvidenceItem, evidenceItem } from
  "./relevance-reader-summary-v3-source-evidence";
import { clusterPromotionStoryRelations, deterministicPromotionStoryId,
  normalizeDuplicateStoryIds, semanticAdmission } from
  "./relevance-reader-summary-v3-story-relations";
import { planWorkspacePresentationSlate } from
  "./relevance-reader-summary-v3-presentation-slate";
import { readerPostPromotionEngagementFact } from
  "./reader-post-promotion-engagement-facts";

/** Headline verification budget; sized with READER_PROMOTION_LIMITS. */
export const maxPresentationCandidates = READER_PROMOTION_PRESENTATION_BUDGET;
const presentationBatchSize = 4;

export class RelevanceReaderSummaryV3Promotion
implements ReaderSummaryV3PromotionPort {
  constructor(
    private readonly assessments: Pick<ReaderValueAssessmentStore, "read">,
    private readonly presentation: PromotionPresentationBuilder,
    private readonly supplementalEvidence: ReaderSummarySupplementalEvidenceSelectorPort,
  ) {}

  async build(params: Parameters<ReaderSummaryV3PromotionPort["build"]>[0]):
  Promise<ReaderSummaryV3PromotionOutcome> {
    const job = params.job.toSnapshot();
    if (job.scope.type === "workspace" &&
        params.manifest.schemaVersion !== "reader_summary_preparation_manifest.v2" ||
        job.scope.type === "interest" &&
        params.manifest.schemaVersion !== "reader_summary_preparation_manifest.v1") {
      return { kind: "dependency_failure", reason: "config_unavailable" };
    }
    if (params.manifest.schemaVersion === "reader_summary_preparation_manifest.v2" &&
        (params.manifest.periodKey !== job.period.periodKey ||
          params.manifest.cutoffAt !== job.preparationCutoffAt)) {
      return { kind: "dependency_failure", reason: "config_unavailable" };
    }
    // A manifest frozen before engagement observation times existed cannot
    // be ranked honestly; fail it closed so the day is rebuilt.
    if (params.manifest.candidates.some((candidate) =>
      !Object.hasOwn(candidate, "engagementObservedAt"))) {
      return { kind: "manifest_outdated" };
    }
    const interestByCandidate = new Map(params.manifest.candidates.map((candidate) =>
      [candidate.candidateId, params.manifest.schemaVersion ===
        "reader_summary_preparation_manifest.v2"
        ? (candidate as typeof params.manifest.candidates[number] & {
          readonly interestId: string }).interestId
        : job.scope.type === "interest" ? job.scope.interestId : ""] as const));
    let supplementalEvidence: readonly SummaryEvidenceItem[];
    try {
      supplementalEvidence = selectGitHubTrendingSupplementalEvidence(
        await this.supplementalEvidence.selectSupplemental({
          tenantId: job.tenantId, workspaceId: job.workspaceId,
          scope: job.scope, period: job.period, userId: job.userId,
          subscriptionId: job.subscriptionId,
          maxItems: maxReaderSummaryEvidenceItems,
          observedThrough: new Date(params.manifest.cutoffAt),
        }),
      );
    } catch (error) {
      return { kind: "dependency_failure", reason: error instanceof Error
        ? error.message : "supplemental_evidence_unavailable" };
    }
    const referenceGroups = new Map<string, ReaderValueReference[]>();
    for (const candidate of params.manifest.candidates) {
      const interestId = interestByCandidate.get(candidate.candidateId)!;
      const reference = {
        assessmentId: candidate.assessmentId, feedItemId: candidate.candidateId,
        ...(params.manifest.schemaVersion ===
          "reader_summary_preparation_manifest.v2"
          ? { sourceBindingId: candidate.sourceBindingId } : {}),
        sourceSnapshotSha256: candidate.sourceSnapshotSha256,
        inputSha256: candidate.inputSha256 };
      const group = referenceGroups.get(interestId);
      if (group === undefined) referenceGroups.set(interestId, [reference]);
      else group.push(reference);
    }
    const reads: ReaderValueRead[] = [];
    let referenceCount = 0;
    for (const [interestId, references] of referenceGroups) {
      referenceCount += references.length;
      for (let offset = 0; offset < references.length; offset += 100) {
        reads.push(...await this.assessments.read({ tenantId: job.tenantId,
          workspaceId: job.workspaceId }, interestId,
        references.slice(offset, offset + 100)));
      }
    }
    if (reads.length !== referenceCount || reads.some((read) =>
      read.status !== "available" || read.assessment.state !== "assessed" ||
      read.assessment.answers === null || read.assessment.assessedAt === null)) {
      return { kind: "dependency_failure", reason: "assessment_unavailable" };
    }
    if (params.manifest.schemaVersion === "reader_summary_preparation_manifest.v2" &&
        (job.preparationDeadlineAt === undefined || reads.some((read) =>
          read.status === "available" && read.assessment.assessedAt !== null &&
          compareReaderSummaryPreparationTimestamps(read.assessment.assessedAt,
            job.preparationDeadlineAt!) > 0))) {
      return { kind: "dependency_failure", reason: "assessment_coverage_timeout" };
    }
    const assessmentById = new Map(reads.flatMap((read) =>
      read.status === "available" ? [[read.assessment.id, read.assessment] as const] : []));
    if (params.manifest.schemaVersion === "reader_summary_preparation_manifest.v2" &&
        params.manifest.candidates.some((frozen) => {
          const assessment = assessmentById.get(frozen.assessmentId);
          const config = params.manifest.schemaVersion ===
            "reader_summary_preparation_manifest.v2" &&
            params.manifest.interests.find((entry) =>
              entry.interestId === frozen.interestId);
          return assessment === undefined ||
            !config ||
            assessment.input.interestId !== frozen.interestId ||
            assessment.input.sourceItemId !== frozen.sourceItemId ||
            assessment.input.sourceRevisionKey !== frozen.sourceRevisionKey ||
            assessment.input.sourceSnapshotSha256 !== frozen.sourceSnapshotSha256 ||
            assessment.input.inputSha256 !== frozen.inputSha256 ||
            assessment.input.interestSha256 !== config.interestSha256 ||
            assessment.input.rubricVersion !== config.rubricVersion ||
            assessment.input.rubricSha256 !== config.rubricSha256 ||
            assessment.input.inputBuilderVersion !== config.inputBuilderVersion ||
            assessment.input.modelConfigVersion !== config.modelConfigVersion ||
            assessment.answers === null ||
            !validateReaderValueAnswers(assessment.answers).ok;
        })) {
      return { kind: "dependency_failure", reason: "assessment_unavailable" };
    }
    const presentationInputById = new Map<string, ReaderPostPresentationV3Input>();
    const explicitStoryIds = new Map(params.manifest.candidates.map((candidate) =>
      [candidate.candidateId, candidate.storyId] as const));
    const deterministicStoryIds = new Map<string, string>();
    const frozenEvidence: SummaryEvidenceItem[] = [];
    const rawCandidates = params.manifest.candidates.map((frozen) => {
      const assessment = assessmentById.get(frozen.assessmentId);
      if (assessment === undefined || assessment.answers === null ||
          assessment.assessedAt === null) {
        throw new Error("Frozen V3 assessment disappeared after readiness");
      }
      const providerFamily = readerPromotionSourceForProviderKey(frozen.providerKey)?.family;
      if (providerFamily === undefined) {
        throw new Error(`Unsupported promotion provider: ${frozen.providerKey}`);
      }
      const snapshot = assessment.input.snapshot;
      const interestId = interestByCandidate.get(frozen.candidateId)!;
      const derivedStoryId = deterministicPromotionStoryId(frozen, snapshot.title,
        snapshot.body);
      deterministicStoryIds.set(frozen.candidateId, derivedStoryId);
      const presentationInput: ReaderPostPresentationV3Input = {
        tenantId: job.tenantId, workspaceId: job.workspaceId,
        interestId, candidateId: frozen.candidateId,
        sourceItemId: frozen.sourceItemId, sourceBindingId: frozen.sourceBindingId,
        providerKey: frozen.providerKey, trustedIntent: snapshot.interest,
        sourceSnapshotSha256: frozen.sourceSnapshotSha256,
        title: snapshot.title, body: snapshot.body,
        captureComplete: snapshot.safety !== "blocked" &&
          !snapshot.retainedSnapshotTruncated &&
          snapshot.capture.availability !== "truncated",
      };
      presentationInputById.set(frozen.candidateId, presentationInput);
      const lead = clusteringEvidenceItem(frozen, presentationInput, assessment);
      frozenEvidence.push(lead);
      return {
        candidateId: frozen.candidateId, interestId,
        providerKey: frozen.providerKey,
        providerFamily, sourceItemId: frozen.sourceItemId,
        canonicalIdentity: frozen.canonicalIdentity,
        storyId: frozen.storyId ?? derivedStoryId,
        publishedAt: canonicalTimestamp(frozen.publishedAt),
        assessmentId: assessment.id,
        assessedAt: canonicalReaderValueTimestamp(assessment.assessedAt),
        rubricVersion: assessment.input.rubricVersion,
        sourceSnapshotSha256: assessment.input.sourceSnapshotSha256,
        inputSha256: assessment.input.inputSha256,
        rubricSha256: assessment.input.rubricSha256,
        modelConfigVersion: assessment.input.modelConfigVersion,
        answers: assessment.answers,
        usefulness: assessment.answers.usefulness.choice,
        relevance: assessment.answers.relevance.choice,
        engagement: readerPostPromotionEngagementFact({
          providerKey: frozen.providerKey,
          providerMetadata: frozen.providerMetadata,
          engagementObservedAt: frozen.engagementObservedAt ?? null,
        }),
        title: snapshot.title,
        presentation: { status: "pending" as const },
        appendixOnly: frozen.sourceKind === "trending_repository",
        scopeValid: true, sourceIdentityValid: frozen.canonicalIdentity.trim().length > 0,
        freshnessValid: inFrozenWindow(frozen.publishedAt, job.period.startedAt,
          job.period.endedAt),
        safetyValid: snapshot.safety !== "blocked", citationValid: true,
        blocked: snapshot.safety === "blocked",
      } satisfies ReaderPostPromotionV3Candidate;
    });
    const clustered = clusterPromotionStoryRelations({
      candidates: rawCandidates, evidence: frozenEvidence,
      cutoffAt: params.manifest.cutoffAt,
      identity: { tenantId: job.tenantId, workspaceId: job.workspaceId,
        scope: job.scope },
      deterministicStoryIds,
      workspaceManifest: params.manifest.schemaVersion ===
        "reader_summary_preparation_manifest.v2",
    });
    if (clustered.kind === "budget_exhausted") {
      return { kind: "budget_exhausted" };
    }
    const candidates = normalizeDuplicateStoryIds(rawCandidates,
      explicitStoryIds, deterministicStoryIds, clustered.clusters);

    const statuses = new Map<string, ReaderPostPromotionV3Presentation>(candidates.map((candidate) =>
      [candidate.candidateId, candidate.presentation] as const));
    const bindingFor = (candidate: ReaderPostPromotionV3Candidate): string =>
      presentationAttemptBinding(candidate, params.manifest.schemaVersion ===
        "reader_summary_preparation_manifest.v2");
    const sealById = new Map<string, ReaderDisplayHeadlineSeal>();
    const admitted = candidates.filter(semanticAdmission);
    // Charge the finite budget only when a distinct presentation binding is
    // actually attempted. Representatives skipped after their story succeeds
    // must leave capacity for later stories.
    const chargedBindings = new Set<string>();
    const attempted = new Set<string>();
    const outcomeByBinding = new Map<string, ReaderPostPromotionV3Presentation>();
    while (true) {
      // Both blocks compete for one budget; plan only headlines that can
      // still change the published board, in the order the board shows them.
      // The slate already holds one representative per story, so a story
      // with a verified headline is never skipped here: a news.google.com
      // publisher freed by a failed headline can make another post of the
      // same story its representative.
      const slate = planWorkspacePresentationSlate(candidates.map((candidate) => ({
        ...candidate, presentation: statuses.get(candidate.candidateId)!,
      })));
      if (slate.settled) break;
      const queue = admitted.filter((candidate) => slate.needed.has(candidate.candidateId))
        .sort((left, right) => {
          const leftRank = slate.priority(left.candidateId);
          const rightRank = slate.priority(right.candidateId);
          return leftRank === rightRank ? 0 : leftRank < rightRank ? -1 : 1;
        });
      let reusedOutcome = false;
      const batch: ReaderPostPromotionV3Candidate[] = [];
      const batchStories = new Set<string>();
      const batchBindings = new Set<string>();
      // A logical batch includes locally rejected captures.  Otherwise an
      // oversize first representative lets four lower-ranked remote calls run
      // before the same-story fallback gets a chance to compete.
      let logicalBatchSize = 0;
      for (const candidate of queue) {
        if (logicalBatchSize >= presentationBatchSize) break;
        if (attempted.has(candidate.candidateId) ||
            batchStories.has(candidate.storyId)) continue;
        const input = presentationInputById.get(candidate.candidateId)!;
        const binding = bindingFor(candidate);
        const priorOutcome = outcomeByBinding.get(binding);
        if (priorOutcome !== undefined) {
          attempted.add(candidate.candidateId);
          statuses.set(candidate.candidateId, priorOutcome);
          reusedOutcome = true;
          continue;
        }
        if (chargedBindings.size + batchBindings.size >= maxPresentationCandidates) {
          break;
        }
        logicalBatchSize += 1;
        batchStories.add(candidate.storyId);
        batchBindings.add(binding);
        if (!input.captureComplete ||
            input.title.length > READER_POST_PRESENTATION_V3_MAX_TITLE_UTF16 ||
            input.body.length > READER_POST_PRESENTATION_V3_MAX_BODY_UTF16) {
          attempted.add(candidate.candidateId);
          const outcome = { status: "unavailable" as const,
            reason: !input.captureComplete
              ? "incomplete_source" as const : "input_over_budget" as const };
          statuses.set(candidate.candidateId, outcome);
          outcomeByBinding.set(binding, outcome);
          chargedBindings.add(binding);
          continue;
        }
        batch.push(candidate);
      }
      // Local outcomes have consumed this logical batch. Reselect before
      // considering another lower-ranked remote candidate.
      // A reused outcome also changes the slate, so plan again.
      if (batch.length === 0) {
        if (logicalBatchSize > 0 || reusedOutcome) continue;
        break;
      }
      const allowed = batch;
      let results: Awaited<ReturnType<PromotionPresentationBuilder["build"]>>;
      try {
        results = await this.presentation.build(allowed.map((candidate) =>
          presentationInputById.get(candidate.candidateId)!));
      } catch (error) {
        return { kind: "dependency_failure", reason: error instanceof Error
          ? error.message : "presentation_dependency_unavailable" };
      }
      if (results.length !== allowed.length || results.some((result) =>
        result.status === "dependency_failure")) {
        return { kind: "dependency_failure", reason:
          "presentation_dependency_unavailable" };
      }
      allowed.forEach((candidate, index) => {
        attempted.add(candidate.candidateId);
        chargedBindings.add(bindingFor(candidate));
        const result = results[index]!;
        if (result.status === "available") {
          const outcome = { status: "available" as const,
            presentationInputDigest: result.presentationInputDigest };
          statuses.set(candidate.candidateId, outcome);
          outcomeByBinding.set(bindingFor(candidate), outcome);
          sealById.set(candidate.candidateId, result.seal);
        } else {
          const outcome = { status: "unavailable" as const,
            reason: result.reason };
          statuses.set(candidate.candidateId, outcome);
          outcomeByBinding.set(bindingFor(candidate), outcome);
        }
      });
    }
    for (const candidate of admitted) {
      if (statuses.get(candidate.candidateId)?.status === "pending") {
        statuses.set(candidate.candidateId, { status: "budget_exhausted" });
      }
    }
    const completed = candidates.map((candidate) => ({ ...candidate,
      presentation: statuses.get(candidate.candidateId)! }));
    let selection = selectReaderPostPromotionsV3(completed);
    const publishedCount = selection.top.length + selection.additional.length +
      selection.news.length;
    if (params.manifest.schemaVersion === "reader_summary_preparation_manifest.v2" &&
        publishedCount < 16 &&
        completed.some((candidate) =>
          (candidate.answers.usefulness.choice === "useful" ||
            candidate.answers.usefulness.choice === "important") &&
          (candidate.answers.relevance.choice === "relevant" ||
            candidate.answers.relevance.choice === "central") &&
          !candidate.appendixOnly && candidate.scopeValid &&
          candidate.freshnessValid && candidate.safetyValid && !candidate.blocked &&
          !candidate.sourceIdentityValid &&
          ![...selection.top, ...selection.additional, ...selection.news]
            .some((selected) => selected.storyId === candidate.storyId))) {
      return { kind: "presentation_unavailable" };
    }
    if (params.manifest.schemaVersion === "reader_summary_preparation_manifest.v2" &&
        selection.excluded.some((entry) =>
          entry.reason === "presentation_budget_exhausted") &&
        !planWorkspacePresentationSlate(completed).settled) {
      if (chargedBindings.size < maxPresentationCandidates || selection.outcome !== "ready" ||
          publishedCount < 8) {
        return { kind: "budget_exhausted" };
      }
      // The optimistic slate is still unresolved. Freeze only the independently
      // sealed survivors, retaining every unavailable/unattempted exclusion.
      selection = Object.freeze({ ...selection, presentationCoverageLimited: true });
    }
    if (selection.outcome !== "ready") {
      if (selection.outcome !== "no_signal" || supplementalEvidence.length === 0) {
        return { kind: selection.outcome };
      }
      return { kind: "ready", evidence: v3EvidenceSelection({
        jobId: job.id, period: job.period, cutoffAt: params.manifest.cutoffAt,
        clusters: [], primaryEvidence: [], supplementalEvidence, selection,
      }) };
    }
    const published = [...selection.top, ...selection.additional, ...selection.news];
    const selectedIds = new Set(published.map((candidate) => candidate.candidateId));
    const evidence = params.manifest.candidates.filter((candidate) =>
      selectedIds.has(candidate.candidateId)).map((frozen): SummaryEvidenceItem => {
        const input = presentationInputById.get(frozen.candidateId)!;
        const result = statuses.get(frozen.candidateId)!;
        if (result.status !== "available") {
          throw new Error("Promotion V3 selected unavailable presentation");
        }
        const assessment = assessmentById.get(frozen.assessmentId)!;
        return evidenceItem(frozen, input, assessment,
          sealById.get(frozen.candidateId)!);
      });
    const clusters = clustersForSelection(selection, evidence, completed);
    const selectedOrdered = published.map((candidate) =>
      evidence.find((item) => item.feedItemId === candidate.candidateId)!);
    const value = v3EvidenceSelection({ jobId: job.id, period: job.period,
      cutoffAt: params.manifest.cutoffAt, clusters,
      primaryEvidence: selectedOrdered, supplementalEvidence, selection });
    return { kind: "ready", evidence: value };
  }
}

const presentationAttemptBinding = (
  candidate: ReaderPostPromotionV3Candidate,
  workspaceManifest: boolean,
): string => `${candidate.interestId ?? ""}\u0000${
  workspaceManifest ? candidate.candidateId : ""}\u0000${
  candidate.assessmentId}\u0000${
  candidate.sourceItemId}\u0000${
  candidate.sourceSnapshotSha256}\u0000${candidate.inputSha256}`;

const canonicalTimestamp = canonicalReaderValueTimestamp;

const inFrozenWindow = (value: string, start: Date, end: Date): boolean => {
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= start.getTime() && time < end.getTime();
};
