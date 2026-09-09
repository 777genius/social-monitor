import type { SummaryEvidenceItem, SummaryEvidenceSelection } from "@social-monitor/summary/domain";
import { isGitHubTrendingEvidence } from "@social-monitor/summary/domain";
import type { ReaderSummaryEvidenceSelectorPort } from "@social-monitor/summary/ports";
import type { Clock } from "@social-monitor/shared-kernel";
import { readerPromotionProviderFamily } from "@social-monitor/shared-kernel";
import { SourceContentQualityPolicy } from "@social-monitor/relevance/domain";
import type { SourceContentQualityReviewerPort, SourceContentQualityReviewRequest } from "@social-monitor/relevance/ports";
import { assessedPromotionVerdict } from "@social-monitor/relevance/features/rank-feed-items/promotion-assessment-verdict";
import { PROMOTION_ASSESSMENT_BOUNDS } from "@social-monitor/relevance/features/rank-feed-items/promotion-content-assessment";
import { createSourceContentAssessmentReviewer } from "@social-monitor/relevance/interfaces/rest/source-content-assessment-provider-tokens";
import { resolveRelevanceContentQualityReviewerMode } from "@social-monitor/relevance/interfaces/rest/relevance-provider-tokens";
import type { GuardedRefreshRuntime } from "./reader-summary-new-input-refresh-model";

type AssessmentCompletion = {
  assertComplete(expected: number, selection?: SummaryEvidenceSelection): void;
  assertCaptureComplete(): void;
};

export type RefreshAssessmentCanonicalCapture = Readonly<{
  canonicalEvidenceJson: string;
  exemptBindingsJson: string;
  sourceTextBindingsJson: string;
}>;

export type RefreshAssessmentCaptureEvent = Readonly<{
  phase: "attempt" | "completed" | "failed";
  batch: number;
  atMs: number;
  requestsJson: string;
  consumed: boolean;
  deadlineAtMs?: number;
  options?: { timeoutMs?: number; deadlineAtMs?: number; aborted: boolean };
  reviewsJson?: string;
  verdictsJson?: string;
  failure?: "deadline" | "aborted" | "validation_or_runtime_failure";
}>;

// This caller only authorizes the existing subscription pool. A direct provider
// override cannot bypass its invocation journal, installation or date authority.
export function createRefreshAssessmentReviewer(input: {
  env: NodeJS.ProcessEnv; clock: Clock; runtime: GuardedRefreshRuntime;
  canonicalEvidence?: readonly SummaryEvidenceItem[];
  capture?: (event: RefreshAssessmentCaptureEvent) => void;
  captureCanonical?: (value: RefreshAssessmentCanonicalCapture) => void;
}): SourceContentQualityReviewerPort & AssessmentCompletion {
  if (resolveRelevanceContentQualityReviewerMode(input.env, "agent-runtime") !== "agent-runtime") {
    throw new Error("Refresh assessment requires the guarded subscription runtime");
  }
  const reviewer = createSourceContentAssessmentReviewer({ env: input.env,
    summaryModelMode: "agent-runtime", client: input.runtime, clock: input.clock });
  // Capture immutable bindings from unpaid canonical ranking, before selection.
  // Selected objects cannot introduce or rewrite exemption provenance.
  const exemptBindings = new Set((input.canonicalEvidence ?? [])
    .filter(isCanonicalAssessmentExemption).map(exemptionBinding));
  // Bind the complete sanitized source representation independently of the
  // capped assessment request, for social and exempt GitHub evidence alike.
  const sourceTextBindings = new Set((input.canonicalEvidence ?? []).map(sourceTextBinding));
  const policy = new SourceContentQualityPolicy();
  const seen = new Map<string, SourceContentQualityReviewRequest>();
  const eligible = new Map<string, { request: SourceContentQualityReviewRequest;
    verdict: ReturnType<typeof assessedPromotionVerdict> }>();
  let abstained = 0;
  let completed = 0;
  let bytes = 0;
  let deadline: number | undefined;
  let captureFailures = 0;
  if (input.captureCanonical) {
    try {
      input.captureCanonical({ canonicalEvidenceJson: JSON.stringify(input.canonicalEvidence ?? []),
        exemptBindingsJson: JSON.stringify([...exemptBindings]),
        sourceTextBindingsJson: JSON.stringify([...sourceTextBindings]) });
    } catch { captureFailures++; }
  }
  let batches = 0;
  let terminalBatches = 0;
  const capture = (event: () => RefreshAssessmentCaptureEvent): void => {
    if (!input.capture) return;
    try { input.capture(event()); } catch { captureFailures++; }
  };
  const fail = (): never => {
    input.runtime.invalidateAdapter("source_content_assessment");
    throw new Error("Refresh assessment is incomplete; original operation requires reconciliation");
  };
  return {
    promotionTiming: reviewer.promotionTiming,
    assertCaptureComplete: () => {
      if ((input.capture || input.captureCanonical) && (captureFailures > 0 || terminalBatches !== batches)) {
        throw new Error("Refresh assessment capture is incomplete");
      }
    },
    assertComplete: (expected, selection) => {
      input.runtime.assertUsable();
      // The snapshot count is an upper bound, not a mandate to spend on every
      // candidate. Every attempted batch must still have a verified outcome.
      if (!Number.isSafeInteger(expected) || expected < completed || completed !== seen.size) fail();
      if (selection === undefined) return;
      // An empty bounded/uncertain result cannot support exhaustive no-signal.
      if (selection.selectedEvidence.length === 0 && (completed < expected || abstained > 0)) {
        throw new Error("Refresh assessment remains pending; cannot publish exhaustive no-signal");
      }
      for (const item of selection.selectedEvidence) {
        if (!sourceTextBindings.has(sourceTextBinding(item))) fail();
        const quality = item.contentQuality;
        if (!quality?.eligibleForSummary || quality.needsLlmReview ||
            !["promote", "keep", "downrank"].includes(quality.decision) ||
            quality.reason.startsWith("promotion_assessment_pending:") ||
            quality.reason.startsWith("promotion_assessment_not_requested:")) return fail();
        // An attempted social identity cannot acquire an exemption by relabeling.
        const recorded = seen.has(item.feedItemId) || [...seen.values()].some((request) =>
          request.promotion?.sourceItemId === item.sourceItemId &&
          request.promotion?.sourceBindingId === item.sourceBindingId &&
          request.promotion?.interestId === item.interestId);
        const canonicalExemption = !recorded && exemptBindings.has(exemptionBinding(item));
        if (canonicalExemption) {
          if (quality.reason.startsWith("promotion_assessment:")) fail();
          continue;
        }
        const assessed = eligible.get(item.feedItemId);
        const request = assessed?.request;
        if (!request || request.providerKey !== item.providerKey || request.title !== item.title.slice(0, 2_000) ||
            request.bodyPreview !== (item.bodyPreview ?? "").slice(0, 12_000) ||
            request.promotion?.interestId !== item.interestId ||
            request.promotion?.sourceItemId !== item.sourceItemId ||
            request.promotion?.sourceBindingId !== item.sourceBindingId ||
            assessed?.verdict.reason !== quality.reason ||
            assessed?.verdict.decision !== quality.decision) fail();
      }
    },
    reviewBatch: async (requests, options) => {
      const batch = ++batches;
      let consumed = false;
      const event = (phase: RefreshAssessmentCaptureEvent["phase"]): RefreshAssessmentCaptureEvent => ({
        phase, batch, atMs: input.clock.now().getTime(), requestsJson: JSON.stringify(requests), consumed,
        deadlineAtMs: deadline,
        options: options && { timeoutMs: options.timeoutMs, deadlineAtMs: options.deadlineAtMs,
          aborted: options.signal.aborted },
      });
      capture(() => event("attempt"));
      try {
        input.runtime.assertUsable();
        const now = input.clock.now().getTime();
        deadline ??= now + reviewer.promotionTiming!.totalTimeoutMs;
        const size = Buffer.byteLength(JSON.stringify(requests), "utf8");
        if (now >= deadline || options?.signal.aborted ||
            requests.some((request) => seen.has(request.candidateId)) ||
            seen.size + requests.length > PROMOTION_ASSESSMENT_BOUNDS.candidates ||
            size > PROMOTION_ASSESSMENT_BOUNDS.batchBytes ||
            bytes + size > PROMOTION_ASSESSMENT_BOUNDS.totalBytes) fail();
        requests.forEach((request) => seen.set(request.candidateId, request));
        consumed = true;
        bytes += size; // Consumed before awaiting. Nothing refunds an attempt.
        const reviews = await reviewer.reviewBatch(requests, options);
        if (input.clock.now().getTime() >= deadline || options?.signal.aborted ||
            reviews.length !== requests.length || new Set(reviews.map((r) => r.candidateId)).size !== reviews.length ||
            requests.some((request) => !reviews.some((review) => review.candidateId === request.candidateId))) fail();
        const verdicts: { candidateId: string; verdict: ReturnType<typeof assessedPromotionVerdict> }[] = [];
        for (const request of requests) {
          const verdict = assessedPromotionVerdict(request,
            reviews.find((review) => review.candidateId === request.candidateId), policy);
          verdicts.push({ candidateId: request.candidateId, verdict });
          if (verdict.reason.startsWith("promotion_assessment_pending:")) {
            // These reasons are emitted only after binding, shape and quote
            // validation. All other pending outcomes remain authority failures.
            if (verdict.reason !== "promotion_assessment_pending:needs_context" &&
                verdict.reason !== "promotion_assessment_pending:low_confidence") fail();
            abstained++;
          } else if (verdict.eligibleForSummary) eligible.set(request.candidateId, { request, verdict });
        }
        input.runtime.assertUsable();
        completed += requests.length;
        terminalBatches++;
        capture(() => ({ ...event("completed"), reviewsJson: JSON.stringify(reviews),
          verdictsJson: JSON.stringify(verdicts) }));
        return reviews;
      } catch {
        terminalBatches++;
        capture(() => ({ ...event("failed"), failure: options?.signal.aborted ? "aborted"
          : deadline !== undefined && input.clock.now().getTime() >= deadline ? "deadline"
            : "validation_or_runtime_failure" }));
        return fail();
      }
    },
  };
}

// Check attempted assessment integrity and selected bindings before generation.
// Canonical ranking keeps unassessed/abstaining candidates pending and unselected.
export function withRefreshAssessmentCompletion(selector: ReaderSummaryEvidenceSelectorPort,
  assessment: AssessmentCompletion, expected: number): ReaderSummaryEvidenceSelectorPort {
  return { select: async (query) => {
    const selection = await selector.select(query);
    assessment.assertComplete(expected, selection);
    return selection;
  } };
}

function isCanonicalAssessmentExemption(item: SummaryEvidenceItem): boolean {
  const facts = item.promotionFacts;
  const quality = item.contentQuality;
  return quality?.eligibleForSummary === true && !quality.needsLlmReview &&
    ["promote", "keep", "downrank"].includes(quality.decision) &&
    !quality.reason.startsWith("promotion_assessment") && (
      (readerPromotionProviderFamily(item.providerKey) === "github_radar" &&
        facts?.contentKind === "repository" && facts.metricsState === "observed" &&
        facts.metrics?.provider === "github_radar") ||
      (isGitHubTrendingEvidence(item) && facts?.contentKind === "github_trending"));
}

function exemptionBinding(item: SummaryEvidenceItem): string {
  return JSON.stringify([item.feedItemId, item.sourceItemId, item.sourceBindingId,
    item.interestId, item.providerKey, item.canonicalUrl, item.title, item.bodyPreview,
    item.promotionFacts, item.contentQuality]);
}

function sourceTextBinding(item: SummaryEvidenceItem): string {
  return JSON.stringify([item.feedItemId, item.sourceItemId, item.sourceBindingId,
    item.interestId, item.providerKey, { sourceText: item.sourceText }]);
}
