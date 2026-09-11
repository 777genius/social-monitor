import type { Clock, IdGenerator } from "@social-monitor/shared-kernel";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type { AgentRuntimeClientPort } from "@social-monitor/summary/ports";
import {
  executionAttestationOutputMatches, isConcreteRuntimePackageVersion, isSha256Hex,
  subscriptionRuntimeEngine,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { SourceContentQualityReviewerPort, SourceContentQualityReviewRequest } from "../../ports";
import { SourceContentAssessmentStageError } from "../../ports";
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
    if (!Number.isSafeInteger(options.batchTimeoutMs) || options.batchTimeoutMs <= 0 || options.batchTimeoutMs > 600_000 ||
        !Number.isSafeInteger(options.totalTimeoutMs) || options.totalTimeoutMs <= 0 || options.totalTimeoutMs > 3_600_000) {
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
      throw new SourceContentAssessmentStageError("runtime_status",
        "Assessment task requires a single tenant/workspace scope");
    }
    const deadlineAtMs = options?.deadlineAtMs ?? (this.options.clock.now().getTime() + this.options.batchTimeoutMs);
    const timeoutMs = Math.min(this.options.batchTimeoutMs, deadlineAtMs - this.options.clock.now().getTime(),
      options?.timeoutMs ?? this.options.batchTimeoutMs);
    if (options?.signal.aborted) {
      throw new SourceContentAssessmentStageError("aborted", "Assessment task deadline exhausted");
    }
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
      throw new SourceContentAssessmentStageError("deadline", "Assessment task deadline exhausted");
    }
    const prompt = JSON.stringify({ candidates: requests.map(promotionWireCandidate) });
    if (Buffer.byteLength(prompt, "utf8") > 64_000) {
      throw new SourceContentAssessmentStageError("runtime_status", "Assessment request too large");
    }
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
    // The transport call itself (network/gRPC/runtime-pool failure before any
    // completed attempt exists) is a distinct, earlier failure than an
    // attested-but-invalid completion below. Classify it separately so
    // telemetry can tell "never got a result" apart from "got one and it was
    // malformed" without ever reading the underlying transport error text.
    let result: Awaited<ReturnType<AgentRuntimeClientPort["runTask"]>>;
    try {
      result = await this.options.client.runTask(command, { signal });
    } catch (error) {
      if (error instanceof SourceContentAssessmentStageError) throw error;
      // The message is kept on the error object itself (never written into
      // telemetry, which only ever reads `.stage`) so existing transport-level
      // validation detail stays visible to direct callers/tests.
      const message = error instanceof Error ? error.message : "Assessment runtime call failed";
      if (signal.aborted) throw new SourceContentAssessmentStageError("aborted", message);
      throw new SourceContentAssessmentStageError("runtime_status", message);
    }
    const attestation = result.executionAttestation;
    if (signal.aborted) {
      throw new SourceContentAssessmentStageError("aborted", "Assessment task deadline exhausted after runtime call");
    }
    if (this.options.clock.now().getTime() >= deadlineAtMs) {
      throw new SourceContentAssessmentStageError("deadline", "Assessment task deadline exhausted after runtime call");
    }
    if (result.status !== "completed" || result.failure !== undefined ||
        attestation === undefined || attestation.schemaVersion !== 1 ||
        attestation.requestId !== requestId || attestation.purpose !== command.purpose ||
        attestation.provider !== command.provider || attestation.model !== command.controls.model ||
        attestation.reasoningEffort !== command.controls.reasoningEffort ||
        attestation.runtimeEngine !== subscriptionRuntimeEngine ||
        !isConcreteRuntimePackageVersion(attestation.runtimePackageVersion) ||
        !isSha256Hex(attestation.canonicalRequestSha256) || !isSha256Hex(attestation.launcherSha256) ||
        attestation.selectedOutputKind !== "structured_output" ||
        !executionAttestationOutputMatches(attestation, result)) {
      throw new SourceContentAssessmentStageError("runtime_status", "Invalid assessment runtime completion");
    }
    const output = JSON.stringify(result.structuredOutput);
    if (output === undefined || Buffer.byteLength(output, "utf8") > 128_000) {
      throw new SourceContentAssessmentStageError("runtime_status", "Assessment output missing or too large");
    }
    // The attestation just verified above (requestId, canonicalRequestSha256,
    // provider/model/reasoningEffort match) already proves the runtime
    // executed exactly this batch's candidates/content for this fresh
    // requestId - each candidate's bindingId is itself part of that attested
    // prompt. That is a stronger, independently verified binding proof than
    // an echoed bindingId string, so the parser can trust candidateId-matched
    // requests here without also requiring a byte-exact echo.
    const reviews = parseReviews(output, requests, { trustAttestedRequestBinding: true });
    if (signal.aborted) {
      throw new SourceContentAssessmentStageError("aborted", "Assessment validation deadline exhausted");
    }
    if (this.options.clock.now().getTime() >= deadlineAtMs) {
      throw new SourceContentAssessmentStageError("deadline", "Assessment validation deadline exhausted");
    }
    return reviews;
  }
}
