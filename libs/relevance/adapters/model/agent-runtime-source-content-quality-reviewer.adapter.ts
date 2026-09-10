import type { Clock, IdGenerator } from "@social-monitor/shared-kernel";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type { AgentRuntimeClientPort } from "@social-monitor/summary/ports";
import {
  executionAttestationOutputMatches, isConcreteRuntimePackageVersion, isSha256Hex,
  subscriptionRuntimeEngine,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { SourceContentQualityReviewerPort, SourceContentQualityReviewRequest } from "../../ports";
import { promotionReviewInstructions, promotionWireCandidate } from "./promotion-review-wire";
import { parseReviews, promotionResponseSchema } from "./source-content-quality-review-wire";

export const sourceContentAssessmentPurpose = "social_monitor.relevance.assess_source_content.v1";

export type AgentRuntimeSourceContentQualityOptions = {
  readonly client: AgentRuntimeClientPort;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly providerInstanceId?: string;
  readonly batchTimeoutMs: number;
  readonly totalTimeoutMs: number;
};

// The existing runtime owns subscription accounts, scheduling and task lifecycle.
// This adapter only translates scoped evidence requests and validates responses.
export class AgentRuntimeSourceContentQualityReviewerAdapter implements SourceContentQualityReviewerPort {
  readonly promotionTiming: { readonly batchTimeoutMs: number; readonly totalTimeoutMs: number };

  constructor(private readonly options: AgentRuntimeSourceContentQualityOptions) {
    if (![options.batchTimeoutMs, options.totalTimeoutMs].every((ms) =>
      Number.isSafeInteger(ms) && ms > 0 && ms <= 600_000)) {
      throw new Error("Invalid agent runtime assessment timeout");
    }
    this.promotionTiming = Object.freeze({ batchTimeoutMs: options.batchTimeoutMs,
      totalTimeoutMs: options.totalTimeoutMs });
  }

  async reviewBatch(requests: readonly SourceContentQualityReviewRequest[],
    options?: { readonly signal: AbortSignal; readonly timeoutMs?: number; readonly deadlineAtMs?: number }) {
    if (requests.length === 0) return [];
    // Ordinary ranking has no authenticated task scope. It cannot launch tasks.
    if (requests.every((request) => request.promotion === undefined)) return [];
    const scope = requests[0]!.promotion;
    if (scope === undefined || !scope.tenantId.trim() || !scope.workspaceId.trim() ||
        requests.length > 8 || requests.some((request) =>
          request.promotion?.tenantId !== scope.tenantId ||
          request.promotion?.workspaceId !== scope.workspaceId)) {
      throw new Error("Assessment task requires a single tenant/workspace scope");
    }
    const deadlineAtMs = options?.deadlineAtMs ?? (this.options.clock.now().getTime() + this.options.batchTimeoutMs);
    const timeoutMs = Math.min(this.options.batchTimeoutMs, deadlineAtMs - this.options.clock.now().getTime(),
      options?.timeoutMs ?? this.options.batchTimeoutMs);
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || options?.signal.aborted) {
      throw new Error("Assessment task deadline exhausted");
    }
    const prompt = JSON.stringify({ candidates: requests.map(promotionWireCandidate) });
    if (Buffer.byteLength(prompt, "utf8") > 64_000) throw new Error("Assessment request too large");
    const requestId = `source-content-assessment:${this.options.ids.generate()}`;
    const command = {
      requestId, correlationId: requestId,
      tenantId: tenantId(scope.tenantId), workspaceId: workspaceId(scope.workspaceId),
      provider: "codex" as const, providerInstanceId: this.options.providerInstanceId,
      purpose: sourceContentAssessmentPurpose,
      systemPrompt: promotionReviewInstructions, prompt, outputSchema: promotionResponseSchema,
      controls: { interactive: false, model: "gpt-5.6-sol", reasoningEffort: "low",
        outputSchemaName: "social_monitor_source_content_quality_review",
        schemaVersion: "source_content_assessment.v1", maxOutputTokens: 6_000 },
      timeoutMs, metadata: { adapter: "agent-runtime-source-content-quality-reviewer" },
    };
    const signal = options === undefined ? AbortSignal.timeout(timeoutMs)
      : AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]);
    const result = await this.options.client.runTask(command, { signal });
    const attestation = result.executionAttestation;
    if (signal.aborted || this.options.clock.now().getTime() >= deadlineAtMs || result.status !== "completed" || result.failure !== undefined ||
        attestation === undefined || attestation.schemaVersion !== 1 ||
        attestation.requestId !== requestId || attestation.purpose !== command.purpose ||
        attestation.provider !== command.provider || attestation.model !== command.controls.model ||
        attestation.reasoningEffort !== command.controls.reasoningEffort ||
        attestation.runtimeEngine !== subscriptionRuntimeEngine ||
        !isConcreteRuntimePackageVersion(attestation.runtimePackageVersion) ||
        !isSha256Hex(attestation.canonicalRequestSha256) || !isSha256Hex(attestation.launcherSha256) ||
        attestation.selectedOutputKind !== "structured_output" ||
        !executionAttestationOutputMatches(attestation, result)) {
      throw new Error("Invalid assessment runtime completion");
    }
    const output = JSON.stringify(result.structuredOutput);
    if (output === undefined || Buffer.byteLength(output, "utf8") > 128_000) {
      throw new Error("Assessment output missing or too large");
    }
    const reviews = parseReviews(output, requests);
    if (signal.aborted || this.options.clock.now().getTime() >= deadlineAtMs) {
      throw new Error("Assessment validation deadline exhausted");
    }
    return reviews;
  }
}
