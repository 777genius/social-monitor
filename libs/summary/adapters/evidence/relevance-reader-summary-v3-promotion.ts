import type {
  ReaderValueAssessment,
  ReaderValueAssessmentStore,
  ReaderValueRead,
  ReaderValueReference,
} from "@social-monitor/relevance/application/contracts/reader-value-assessment-store";
import { canonicalReaderValueTimestamp } from
  "@social-monitor/relevance/domain/reader-value/canonical-reader-value-timestamp";

import {
  compareReaderPostPromotionV3,
  selectReaderPostPromotionsV3,
  type ReaderPostPromotionV3Candidate,
  type ReaderPostPromotionV3Presentation,
  type ReaderPostPromotionV3Provider,
  type ReaderSummaryPreparationCandidate,
  type ReaderDisplayHeadlineSeal,
  type StoryCluster,
  type SummaryEvidenceItem,
  type SummaryEvidenceSelection,
  canonicalReaderSummaryPreparationTimestamp,
} from "../../domain";
import { STORY_RANKING_POLICY_V1 } from
  "../../domain/policies/story-ranking-policy";
import { storyKey } from "../../domain/services/story-key-normalizer";
import type { PromotionPresentationBuilder,
  ReaderPostPresentationV3Input } from
  "../../domain/services/reader-post-presentation-v3";
import { READER_POST_PRESENTATION_V3_MAX_BODY_UTF16,
  READER_POST_PRESENTATION_V3_MAX_TITLE_UTF16 } from
  "../../domain/services/reader-post-presentation-v3";
import type { ReaderSummaryV3PromotionPort,
  ReaderSummaryV3PromotionOutcome } from "../../ports";

const maxPresentationCandidates = 32;
const presentationBatchSize = 4;

export class RelevanceReaderSummaryV3Promotion
implements ReaderSummaryV3PromotionPort {
  constructor(
    private readonly assessments: Pick<ReaderValueAssessmentStore, "read">,
    private readonly presentation: PromotionPresentationBuilder,
  ) {}

  async build(params: Parameters<ReaderSummaryV3PromotionPort["build"]>[0]):
  Promise<ReaderSummaryV3PromotionOutcome> {
    const job = params.job.toSnapshot();
    if (job.scope.type !== "interest" ||
        params.manifest.schemaVersion !== "reader_summary_preparation_manifest.v1") {
      return { kind: "dependency_failure", reason: "config_unavailable" };
    }
    const interestId = job.scope.interestId;
    const references: ReaderValueReference[] = params.manifest.candidates.map(
      (candidate) => ({ assessmentId: candidate.assessmentId,
        feedItemId: candidate.candidateId,
        sourceSnapshotSha256: candidate.sourceSnapshotSha256,
        inputSha256: candidate.inputSha256 }));
    const reads: ReaderValueRead[] = [];
    for (let offset = 0; offset < references.length; offset += 100) {
      reads.push(...await this.assessments.read({ tenantId: job.tenantId,
        workspaceId: job.workspaceId }, interestId,
      references.slice(offset, offset + 100)));
    }
    if (reads.length !== references.length || reads.some((read) =>
      read.status !== "available" || read.assessment.state !== "assessed" ||
      read.assessment.answers === null || read.assessment.assessedAt === null)) {
      return { kind: "dependency_failure", reason: "assessment_unavailable" };
    }
    const assessmentById = new Map(reads.flatMap((read) =>
      read.status === "available" ? [[read.assessment.id, read.assessment] as const] : []));
    const presentationInputById = new Map<string, ReaderPostPresentationV3Input>();
    const explicitStoryIds = new Map(params.manifest.candidates.map((candidate) =>
      [candidate.candidateId, candidate.storyId] as const));
    const deterministicStoryIds = new Map<string, string>();
    const candidates = normalizeDuplicateStoryIds(params.manifest.candidates.map((frozen) => {
      const assessment = assessmentById.get(frozen.assessmentId);
      if (assessment === undefined || assessment.answers === null ||
          assessment.assessedAt === null) {
        throw new Error("Frozen V3 assessment disappeared after readiness");
      }
      const providerFamily = promotionProviderFamily(frozen.providerKey);
      const snapshot = assessment.input.snapshot;
      const derivedStoryId = deterministicStoryId(frozen, snapshot.title, snapshot.body);
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
      return {
        candidateId: frozen.candidateId, providerKey: frozen.providerKey,
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
        answers: assessment.answers, presentation: { status: "pending" as const },
        appendixOnly: frozen.sourceKind === "trending_repository",
        scopeValid: true, sourceIdentityValid: frozen.canonicalIdentity.trim().length > 0,
        freshnessValid: inFrozenWindow(frozen.publishedAt, job.period.startedAt,
          job.period.endedAt),
        safetyValid: snapshot.safety !== "blocked", citationValid: true,
        blocked: snapshot.safety === "blocked",
      } satisfies ReaderPostPromotionV3Candidate;
    }), explicitStoryIds, deterministicStoryIds).sort(compareReaderPostPromotionV3);

    const statuses = new Map<string, ReaderPostPromotionV3Presentation>(candidates.map((candidate) =>
      [candidate.candidateId, candidate.presentation] as const));
    const sealById = new Map<string, ReaderDisplayHeadlineSeal>();
    const admitted = candidates.filter(semanticAdmission);
    // Charge the finite budget only when a distinct presentation binding is
    // actually attempted. Representatives skipped after their story succeeds
    // must leave capacity for later stories.
    const chargedBindings = new Set<string>();
    const attempted = new Set<string>();
    const outcomeByBinding = new Map<string, ReaderPostPromotionV3Presentation>();
    const readyStories = new Set<string>();
    while (true) {
      const batch: ReaderPostPromotionV3Candidate[] = [];
      const batchStories = new Set<string>();
      const batchBindings = new Set<string>();
      // A logical batch includes locally rejected captures.  Otherwise an
      // oversize first representative lets four lower-ranked remote calls run
      // before the same-story fallback gets a chance to compete.
      let logicalBatchSize = 0;
      for (const candidate of admitted) {
        if (logicalBatchSize >= presentationBatchSize) break;
        if (attempted.has(candidate.candidateId) || readyStories.has(candidate.storyId) ||
            batchStories.has(candidate.storyId)) continue;
        const input = presentationInputById.get(candidate.candidateId)!;
        const binding = presentationAttemptBinding(candidate);
        const priorOutcome = outcomeByBinding.get(binding);
        if (priorOutcome !== undefined) {
          attempted.add(candidate.candidateId);
          statuses.set(candidate.candidateId, priorOutcome);
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
      if (batch.length === 0) {
        if (logicalBatchSize > 0) continue;
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
        chargedBindings.add(presentationAttemptBinding(candidate));
        const result = results[index]!;
        if (result.status === "available") {
          const outcome = { status: "available" as const,
            presentationInputDigest: result.presentationInputDigest };
          statuses.set(candidate.candidateId, outcome);
          outcomeByBinding.set(presentationAttemptBinding(candidate), outcome);
          readyStories.add(candidate.storyId);
          sealById.set(candidate.candidateId, result.seal);
        } else {
          const outcome = { status: "unavailable" as const,
            reason: result.reason };
          statuses.set(candidate.candidateId, outcome);
          outcomeByBinding.set(presentationAttemptBinding(candidate), outcome);
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
    const selection = selectReaderPostPromotionsV3(completed);
    if (selection.outcome !== "ready") return { kind: selection.outcome };
    const selectedIds = new Set([...selection.top, ...selection.additional]
      .map((candidate) => candidate.candidateId));
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
    const selectedOrdered = [...selection.top, ...selection.additional].map((candidate) =>
      evidence.find((item) => item.feedItemId === candidate.candidateId)!);
    const exactCutoff = canonicalReaderSummaryPreparationTimestamp(
      params.manifest.cutoffAt);
    const value: SummaryEvidenceSelection = {
      rankingPolicyVersion: "reader_promotion_policy.v3",
      sourceWindow: {
        windowId: `reader-summary-v3:${job.id}`,
        startedAt: job.period.startedAt,
        endedAt: job.period.endedAt,
        selectedFeedItemIds: selectedOrdered.map((item) => item.feedItemId),
        storyClusterIds: clusters.map((cluster) => cluster.id),
        periodStartedAt: job.period.startedAt,
        periodEndedAt: job.period.endedAt,
        ingestionCutoff: new Date(exactCutoff),
        exactIngestionCutoff: exactCutoff,
      },
      clusters, selectedEvidence: selectedOrdered, promotionV3: selection,
    };
    return { kind: "ready", evidence: value };
  }
}

const semanticAdmission = (candidate: ReaderPostPromotionV3Candidate): boolean =>
  (candidate.answers.usefulness.choice === "useful" ||
    candidate.answers.usefulness.choice === "important") &&
  (candidate.answers.relevance.choice === "relevant" ||
    candidate.answers.relevance.choice === "central") &&
  !candidate.appendixOnly && candidate.scopeValid && candidate.sourceIdentityValid &&
  candidate.freshnessValid && candidate.safetyValid && !candidate.blocked;

const promotionProviderFamily = (providerKey: string): ReaderPostPromotionV3Provider => {
  const key = providerKey.trim().toLowerCase();
  if (key === "x" || key === "twitter" || key === "x-twitter") return "x";
  if (key === "reddit") return "reddit";
  if (key === "hn" || key === "hacker_news" || key === "hacker-news") {
    return "hacker_news";
  }
  if (key === "rss") return "rss";
  if (key === "github" || key === "github_radar" ||
      key === "github-repo-radar" || key === "github-trending-page") {
    return "github_radar";
  }
  throw new Error(`Unsupported V3 presentation provider: ${providerKey}`);
};

const presentationAttemptBinding = (
  candidate: ReaderPostPromotionV3Candidate,
): string => `${candidate.sourceItemId}\u0000${candidate.storyId}`;

const deterministicStoryId = (candidate: ReaderSummaryPreparationCandidate,
  title: string, body: string): string => `story:${storyKey({
  feedItemId: candidate.candidateId, sourceItemId: candidate.sourceItemId,
  sourceBindingId: candidate.sourceBindingId, interestId: "frozen-v3",
  providerKey: candidate.providerKey, canonicalUrl: candidate.canonicalIdentity,
  title, bodyPreview: body, publishedAt: new Date(candidate.publishedAt),
  observedAt: new Date(candidate.observedAt), score: 0, whyImportant: [],
}, STORY_RANKING_POLICY_V1)}`;

const normalizeDuplicateStoryIds = (
  candidates: readonly ReaderPostPromotionV3Candidate[],
  explicitStoryIds: ReadonlyMap<string, string | undefined>,
  deterministicStoryIds: ReadonlyMap<string, string>,
): ReaderPostPromotionV3Candidate[] => {
  const parent = new Map(candidates.map((candidate) =>
    [candidate.candidateId, candidate.candidateId] as const));
  const find = (id: string): string => {
    const next = parent.get(id)!;
    if (next === id) return id;
    const root = find(next);
    parent.set(id, root);
    return root;
  };
  const union = (left: string, right: string): void => {
    const roots = [find(left), find(right)].sort(compareUtf8Bytes);
    if (roots[0] !== roots[1]) parent.set(roots[1]!, roots[0]!);
  };
  const bySource = new Map<string, string>();
  const byStory = new Map<string, string>();
  const byDeterministicStory = new Map<string, string>();
  for (const candidate of candidates) {
    for (const [key, map] of [[candidate.sourceItemId, bySource],
      [candidate.storyId, byStory],
      [deterministicStoryIds.get(candidate.candidateId)!, byDeterministicStory]] as const) {
      const previous = map.get(key);
      if (previous === undefined) map.set(key, candidate.candidateId);
      else union(previous, candidate.candidateId);
    }
  }
  const groups = new Map<string, ReaderPostPromotionV3Candidate[]>();
  for (const candidate of candidates) {
    const root = find(candidate.candidateId);
    groups.set(root, [...(groups.get(root) ?? []), candidate]);
  }
  const storyByCandidate = new Map<string, string>();
  for (const group of groups.values()) {
    const explicit = group.flatMap((candidate) => {
      const value = explicitStoryIds.get(candidate.candidateId);
      return value === undefined ? [] : [value];
    }).sort(compareUtf8Bytes);
    const storyId = explicit[0] ?? group.map((candidate) => candidate.storyId)
      .sort(compareUtf8Bytes)[0]!;
    for (const candidate of group) storyByCandidate.set(candidate.candidateId, storyId);
  }
  return candidates.map((candidate) => ({ ...candidate,
    storyId: storyByCandidate.get(candidate.candidateId)! }));
};

const canonicalTimestamp = canonicalReaderValueTimestamp;
const compareUtf8Bytes = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

const inFrozenWindow = (value: string, start: Date, end: Date): boolean => {
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= start.getTime() && time < end.getTime();
};

const evidenceItem = (
  frozen: ReaderSummaryPreparationCandidate,
  input: ReaderPostPresentationV3Input,
  assessment: ReaderValueAssessment,
  seal: ReaderDisplayHeadlineSeal,
): SummaryEvidenceItem => ({
  readerHeadline: seal.headline,
  feedItemId: frozen.candidateId, sourceItemId: frozen.sourceItemId,
  sourceBindingId: frozen.sourceBindingId, interestId: assessment.input.interestId,
  providerKey: frozen.providerKey, canonicalUrl: frozen.canonicalIdentity,
  title: input.title, bodyPreview: input.body, sourceText: input.body,
  publishedAt: new Date(frozen.publishedAt), observedAt: new Date(frozen.observedAt),
  score: 0, whyImportant: [], readerActionKind: "read_source",
  storyKeyHint: frozen.storyId,
});

const clustersForSelection = (
  selection: ReturnType<typeof selectReaderPostPromotionsV3>,
  evidence: readonly SummaryEvidenceItem[],
  candidates: readonly ReaderPostPromotionV3Candidate[],
): readonly StoryCluster[] => [...selection.top, ...selection.additional].map((candidate) => {
  const item = evidence.find((value) => value.feedItemId === candidate.candidateId)!;
  const duplicateFeedItemIds = candidates.filter((value) =>
    value.candidateId !== candidate.candidateId &&
    (value.storyId === candidate.storyId || value.sourceItemId === candidate.sourceItemId))
    .map((value) => value.candidateId);
  return { id: candidate.storyId, storyKey: candidate.storyId,
    rankingPolicyVersion: "reader_promotion_policy.v3",
    representativeFeedItemId: candidate.candidateId, duplicateFeedItemIds,
    interestIds: [item.interestId], providerKeys: [candidate.providerKey], score: 0,
    observedAtRange: { startedAt: item.observedAt, endedAt: item.observedAt },
    whyImportant: [] };
});
