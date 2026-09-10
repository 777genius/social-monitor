import { executionAttestationOutputMatches, isConcreteRuntimePackageVersion,
  isSha256Hex, subscriptionRuntimeEngine } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { sourceContentAssessmentPurpose } from "@social-monitor/relevance/adapters/model/agent-runtime-source-content-quality-reviewer.adapter";
import { PROMOTION_ASSESSMENT_BOUNDS } from "@social-monitor/relevance/features/rank-feed-items/promotion-content-assessment";
import type { AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "@social-monitor/summary/ports";

export { sourceContentAssessmentPurpose };
export const refreshAssessmentLimits = Object.freeze({ ...PROMOTION_ASSESSMENT_BOUNDS,
  totalTimeoutMs: 3_600_000, batchTimeoutMs: 600_000 });

// Per consumed operation, not per selection or adapter instance. Request IDs
// alone cannot prevent a second assessment of the same captured candidate.
export function refreshAssessmentBudget(now: () => number) {
  let deadline: number | undefined;
  let batchDeadline: number | undefined;
  let attempts = 0;
  let bytes = 0;
  const candidates = new Set<string>();
  return {
    consume(command: AgentRuntimeTaskCommand) {
      const bounds = refreshAssessmentLimits;
      deadline ??= now() + bounds.totalTimeoutMs;
      const batch: unknown = JSON.parse(command.prompt).candidates;
      const size = Buffer.byteLength(command.prompt, "utf8");
      const ids = Array.isArray(batch) ? batch.map((item: { candidateId?: unknown }) => item?.candidateId) : [];
      if (ids.length === 0 || ids.length > bounds.batchCandidates ||
          ids.some((id) => typeof id !== "string" || !id.trim() || candidates.has(id)) ||
          new Set(ids).size !== ids.length || candidates.size + ids.length > bounds.candidates ||
          attempts >= bounds.candidates || size > bounds.batchBytes || bytes + size > bounds.totalBytes ||
          !Number.isSafeInteger(command.timeoutMs) || command.timeoutMs! <= 0 ||
          command.timeoutMs! > bounds.batchTimeoutMs || now() + command.timeoutMs! > deadline) {
        throw new Error("Refresh assessment budget exhausted or duplicate candidate");
      }
      batchDeadline = now() + command.timeoutMs!;
      ids.forEach((id) => candidates.add(id as string));
      bytes += size;
      attempts++;
      return { assessmentAttempts: attempts, assessmentCandidates: candidates.size,
        assessmentBytes: bytes, assessmentDeadlineAtMs: deadline };
    },
    assertTimely() {
      if ((deadline !== undefined && now() >= deadline) || (batchDeadline !== undefined && now() >= batchDeadline)) throw new Error("Refresh assessment deadline exhausted");
    },
  };
}

// Summary task-role policy deliberately does not authorize relevance tasks.
// Validate the assessment's own envelope, then the caller checks the exact
// admitted request hash and manifest installation exactly as for generation.
export function verifyRefreshAssessmentExecution(command: AgentRuntimeTaskCommand, result: AgentRuntimeTaskResult) {
  const a = result.executionAttestation;
  const usage = result.usage;
  if (usage === undefined || ![usage.inputTokens, usage.outputTokens, usage.totalTokens]
      .every((count) => Number.isSafeInteger(count) && count! >= 0) ||
      usage.totalTokens !== usage.inputTokens! + usage.outputTokens!) {
    throw new Error("Refresh assessment usage requires reconciliation");
  }
  if (result.status !== "completed" || result.failure !== undefined || a === undefined ||
      a.schemaVersion !== 1 || a.requestId !== command.requestId || a.purpose !== sourceContentAssessmentPurpose ||
      a.provider !== command.provider || a.model !== command.controls.model ||
      a.reasoningEffort !== command.controls.reasoningEffort || a.runtimeEngine !== subscriptionRuntimeEngine ||
      !isConcreteRuntimePackageVersion(a.runtimePackageVersion) || !isSha256Hex(a.launcherSha256) ||
      !isSha256Hex(a.canonicalRequestSha256) || a.selectedOutputKind !== "structured_output" ||
      !executionAttestationOutputMatches(a, result)) throw new Error("Invalid refresh assessment attestation");
}
