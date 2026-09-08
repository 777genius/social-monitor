import type { Clock } from "@social-monitor/shared-kernel";
import type { SourceContentQualityPolicy } from "../../domain";
import type { SourceContentQualityReviewerPort, SourceContentQualityReviewRequest,
  SourceContentQualityReviewResult } from "../../ports";
import { assessedPromotionVerdict, pendingPromotionAssessment } from "./promotion-assessment-verdict";

export const PROMOTION_ASSESSMENT_BOUNDS = Object.freeze({
  candidates: 200, batchCandidates: 8, batchBytes: 64_000,
  totalBytes: 512_000, batchTimeoutMs: 15_000, deadlineMs: 60_000,
});

// All supplied requests have already passed immutable non-content gates.
// Every candidate starts pending; budget, transport and protocol failures cannot
// fall through to a heuristic pass. Batches are sequential and popularity-free.
export const assessPromotionContent = async (input: {
  readonly requests: readonly SourceContentQualityReviewRequest[];
  readonly reviewer?: SourceContentQualityReviewerPort;
  readonly policy: SourceContentQualityPolicy;
  readonly clock: Clock;
}) => {
  const bounds = PROMOTION_ASSESSMENT_BOUNDS;
  const verdicts = new Map(input.requests.map((request) => [request.candidateId,
    pendingPromotionAssessment(request.deterministic, "budget_exhausted")]));
  const requests = [...input.requests].sort((a, b) =>
    a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0);
  if (new Set(requests.map(({ candidateId }) => candidateId)).size !== requests.length) {
    for (const request of requests) verdicts.set(request.candidateId,
      pendingPromotionAssessment(request.deterministic, "duplicate_candidate"));
    return verdicts;
  }
  const deadline = input.clock.now().getTime() + bounds.deadlineMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), bounds.deadlineMs);
  let bytesUsed = 0;
  let count = 0;
  try {
    while (requests.length > 0 && count < bounds.candidates &&
        !controller.signal.aborted && input.clock.now().getTime() < deadline) {
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
      const remaining = Math.min(bounds.batchTimeoutMs, deadline - input.clock.now().getTime());
      const response = await reviewWithinDeadline(input.reviewer, batch, controller.signal, remaining);
      const malformed = response !== undefined && (!Array.isArray(response) ||
        response.some((review) => !review || !batch.some((r) => r.candidateId === review.candidateId)) ||
        new Set(response.map((review) => review.candidateId)).size !== response.length);
      for (const request of batch) {
        const verdict = malformed
          ? pendingPromotionAssessment(request.deterministic, "invalid_batch")
          : response === undefined
            ? pendingPromotionAssessment(request.deterministic, "unavailable_or_timeout")
            : assessedPromotionVerdict(request,
                response.find((review) => review.candidateId === request.candidateId), input.policy);
        verdicts.set(request.candidateId, verdict);
      }
    }
  } finally { clearTimeout(timer); }
  return verdicts;
};

const reviewWithinDeadline = async (
  reviewer: SourceContentQualityReviewerPort | undefined,
  batch: readonly SourceContentQualityReviewRequest[], signal: AbortSignal, timeoutMs: number,
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
      reviewer.reviewBatch(batch, { signal: controller.signal }).catch(() => undefined), timeout,
    ]);
  } catch { return undefined; }
  finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
};
