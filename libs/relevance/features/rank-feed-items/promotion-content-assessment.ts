import type { PromotionHeadlineDiagnosticObserver } from "./promotion-headline-diagnostic";
import type { Clock } from "@social-monitor/shared-kernel";
import type { SourceContentQualityPolicy } from "../../domain";
import type { SourceContentQualityReviewerPort, SourceContentQualityReviewRequest,
  SourceContentQualityReviewResult } from "../../ports";
import { assessedPromotionVerdict, pendingPromotionAssessment } from "./promotion-assessment-verdict";
import { unavailablePromotionHeadline, type PromotionReaderHeadline } from "../../domain/promotion-reader-headline";
import { assessPromotionReaderHeadline } from "./promotion-reader-headline-assessment";

type PromotionAssessmentPriority = {
  readonly providerFamily: string;
  readonly engagementSalience: number;
};

export const PROMOTION_ASSESSMENT_BOUNDS = Object.freeze({
  candidates: 200, batchCandidates: 8, batchBytes: 64_000,
  totalBytes: 512_000, batchTimeoutMs: 15_000, deadlineMs: 60_000,
});

// All supplied requests have already passed immutable non-content gates.
// Every candidate starts pending; budget, transport and protocol failures cannot
// fall through to a heuristic pass. Scheduling priority never enters the model
// request; callers may explicitly opt into bounded concurrency when their
// reviewer owns a safe pool.
export const assessPromotionContent = async (input: {
  readonly observeHeadlineDiagnostic?: PromotionHeadlineDiagnosticObserver;
  readonly execution?: { readonly deadlineAtMs: number; readonly signal?: AbortSignal };
  readonly requests: readonly SourceContentQualityReviewRequest[];
  readonly priorityByCandidateId?: ReadonlyMap<string, PromotionAssessmentPriority>;
  readonly reviewer?: SourceContentQualityReviewerPort;
  readonly policy: SourceContentQualityPolicy;
  readonly clock: Clock;
}) => {
  const bounds = PROMOTION_ASSESSMENT_BOUNDS;
  const timing = input.reviewer?.promotionTiming;
  const totalTimeoutMs = timing?.totalTimeoutMs ?? bounds.deadlineMs;
  const batchTimeoutMs = timing?.batchTimeoutMs ?? bounds.batchTimeoutMs;
  const batchConcurrency = timing?.batchConcurrency ?? 1;
  if (!Number.isSafeInteger(batchTimeoutMs) || batchTimeoutMs <= 0 || batchTimeoutMs > 600_000 ||
      !Number.isSafeInteger(totalTimeoutMs) || totalTimeoutMs <= 0 || totalTimeoutMs > 3_600_000 ||
      !Number.isSafeInteger(batchConcurrency) || batchConcurrency < 1 || batchConcurrency > 8) {
    throw new Error("Invalid promotion assessment deadline");
  }
  const verdicts = new Map(input.requests.map((request) => [request.candidateId,
    pendingPromotionAssessment(request.deterministic, "budget_exhausted")]));
  const readerHeadlines = new Map<string, PromotionReaderHeadline>(input.requests.map((request) =>
    [request.candidateId, unavailablePromotionHeadline("not_assessed")]));
  const requests = providerAwareAssessmentOrder(input.requests, input.priorityByCandidateId);
  if (new Set(requests.map(({ candidateId }) => candidateId)).size !== requests.length) {
    for (const request of requests) verdicts.set(request.candidateId,
      pendingPromotionAssessment(request.deterministic, "duplicate_candidate"));
    return { verdicts, readerHeadlines };
  }
  const startedAt = input.clock.now().getTime();
  const deadline = Math.min(startedAt + totalTimeoutMs, input.execution?.deadlineAtMs ?? Infinity);
  if (!Number.isSafeInteger(deadline) || deadline <= startedAt || input.execution?.signal?.aborted) return { verdicts, readerHeadlines };
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.execution?.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, deadline - startedAt);
  let bytesUsed = 0;
  let count = 0;
  try {
    const batches: SourceContentQualityReviewRequest[][] = [];
    while (requests.length > 0 && count < bounds.candidates) {
      const batch: SourceContentQualityReviewRequest[] = [];
      let bytes = 2;
      bytesUsed += 2;
      while (requests.length > 0 && batch.length < bounds.batchCandidates &&
          count < bounds.candidates) {
        const request = requests[0]!;
        const size = new TextEncoder().encode(JSON.stringify(request)).length + 1;
        if (size + 2 > bounds.batchBytes || bytesUsed + size > bounds.totalBytes) {
          requests.shift();
          continue;
        }
        if (bytes + size > bounds.batchBytes) break;
        requests.shift(); batch.push(request); bytes += size; bytesUsed += size; count++;
      }
      if (batch.length === 0) break;
      batches.push(batch);
    }
    let next = 0;
    const processBatches = async () => {
      while (next < batches.length && !controller.signal.aborted && input.clock.now().getTime() < deadline) {
        const batch = batches[next++]!;
        const now = input.clock.now().getTime();
        const batchDeadline = Math.min(deadline, now + batchTimeoutMs);
        const response = await reviewWithinDeadline(input.reviewer, batch, controller.signal,
          batchDeadline - now, batchDeadline);
        const timelyResponse = !controller.signal.aborted && input.clock.now().getTime() < deadline ? response : undefined;
        const malformed = timelyResponse !== undefined && (!Array.isArray(timelyResponse) ||
          timelyResponse.some((review) => !review || !batch.some((r) => r.candidateId === review.candidateId)) ||
          new Set(timelyResponse.map((review) => review.candidateId)).size !== timelyResponse.length);
        for (const request of batch) {
          const verdict = malformed
            ? pendingPromotionAssessment(request.deterministic, "invalid_batch")
            : timelyResponse === undefined
              ? pendingPromotionAssessment(request.deterministic, "unavailable_or_timeout")
              : assessedPromotionVerdict(request,
                  timelyResponse.find((review) => review.candidateId === request.candidateId), input.policy);
          verdicts.set(request.candidateId, verdict);
          readerHeadlines.set(request.candidateId,
            malformed || timelyResponse === undefined || verdict.reason.startsWith("promotion_assessment_pending:")
              ? unavailablePromotionHeadline("invalid_assessment")
              : assessPromotionReaderHeadline(request,
                  timelyResponse.find((review) => review.candidateId === request.candidateId), input.observeHeadlineDiagnostic));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(batchConcurrency, batches.length) }, processBatches));
  } finally {
    clearTimeout(timer);
    input.execution?.signal?.removeEventListener("abort", abort);
  }
  return { verdicts, readerHeadlines };
};

const providerAwareAssessmentOrder = (
  requests: readonly SourceContentQualityReviewRequest[],
  priorityByCandidateId: ReadonlyMap<string, PromotionAssessmentPriority> | undefined,
): SourceContentQualityReviewRequest[] => {
  const byProvider = new Map<string, SourceContentQualityReviewRequest[]>();
  for (const request of requests) {
    const providerFamily = priorityByCandidateId?.get(request.candidateId)?.providerFamily ??
      request.providerKey;
    const provider = byProvider.get(providerFamily) ?? [];
    provider.push(request);
    byProvider.set(providerFamily, provider);
  }
  const priority = (candidateId: string) => {
    const value = priorityByCandidateId?.get(candidateId)?.engagementSalience;
    return value !== undefined && Number.isFinite(value) ? value : 0;
  };
  const candidateOrder = (a: SourceContentQualityReviewRequest, b: SourceContentQualityReviewRequest) => {
    const priorityDifference = priority(b.candidateId) - priority(a.candidateId);
    return priorityDifference || compareStrings(a.candidateId, b.candidateId);
  };
  const providers = [...byProvider.entries()].sort(([a], [b]) => compareStrings(a, b));
  for (const [, providerRequests] of providers) providerRequests.sort(candidateOrder);
  const ordered: SourceContentQualityReviewRequest[] = [];
  // A lexical provider round-robin prevents a populous network from consuming
  // the global cap; each network contributes its strongest remaining item.
  for (let index = 0; ordered.length < requests.length; index++) {
    for (const [, providerRequests] of providers) {
      const request = providerRequests[index];
      if (request !== undefined) ordered.push(request);
    }
  }
  return ordered;
};

const compareStrings = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

const reviewWithinDeadline = async (
  reviewer: SourceContentQualityReviewerPort | undefined,
  batch: readonly SourceContentQualityReviewRequest[], signal: AbortSignal, timeoutMs: number, deadlineAtMs: number,
): Promise<readonly SourceContentQualityReviewResult[] | undefined> => {
  if (reviewer === undefined || signal.aborted || timeoutMs <= 0) return undefined;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort = () => {};
  const timeout = new Promise<undefined>((resolve) => {
    onAbort = () => { controller.abort(); resolve(undefined); };
    signal.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(onAbort, timeoutMs);
  });
  try {
    return await Promise.race([
      reviewer.reviewBatch(batch, { signal: controller.signal, timeoutMs, deadlineAtMs }).catch(() => undefined), timeout,
    ]);
  } catch { return undefined; }
  finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
};
