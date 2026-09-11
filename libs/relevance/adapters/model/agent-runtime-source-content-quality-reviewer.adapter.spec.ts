import { FixedClock } from "@social-monitor/shared-kernel";
import { SourceContentAssessmentStageError } from "../../ports";
import type { SourceContentQualityReviewRequest } from "../../ports";
import { SourceContentQualityPolicy } from "../../domain";
import { AgentRuntimeSourceContentQualityReviewerAdapter } from "./agent-runtime-source-content-quality-reviewer.adapter";
import { promotionWireCandidate } from "./promotion-review-wire";
import { attestRefreshExecution, refreshTestRuntimeClient } from "../../../../scripts/lib/reader-summary-new-input-refresh-model.spec-support";

const cutoff = new Date("2026-09-11T12:00:00.000Z");

const request = (id = "synthetic-wire"): SourceContentQualityReviewRequest => ({
  candidateId: id, providerKey: "reddit", title: "Measured compiler diagnostics",
  bodyPreview: "Concrete first-party benchmark numbers for the compiler release.",
  deterministic: new SourceContentQualityPolicy().evaluate({ providerKey: "reddit",
    title: "Measured compiler diagnostics", providerMetadata: { query: "compiler diagnostics" } }),
  promotion: Object.freeze({ tenantId: "synthetic-tenant", workspaceId: "synthetic-workspace",
    interestId: "synthetic-interest", sourceBindingId: "synthetic-binding", sourceItemId: `source-${id}`,
    trustedIntent: "compiler diagnostics", availability: "body_present" }),
});

const validReview = (input: SourceContentQualityReviewRequest) => ({
  candidateId: input.candidateId, bindingId: promotionWireCandidate(input).bindingId,
  decision: "promote", confidence: 0.9, qualityScore: 0.7, interestRelevanceScore: 0.9,
  engagementIntegrityScore: 0.9, flags: [], reason: "Synthetic review",
  evidence: [{ field: "title", start: 0, end: input.title.length, quote: input.title }],
  resolvedSoftFlags: [],
});

const adapterFor = (client: ReturnType<typeof refreshTestRuntimeClient>) =>
  new AgentRuntimeSourceContentQualityReviewerAdapter({ clock: new FixedClock(cutoff),
    ids: { generate: () => "sandbox-stage" }, batchTimeoutMs: 300_000, totalTimeoutMs: 600_000, client });

const stageOf = async (promise: Promise<unknown>): Promise<string> => {
  try { await promise; throw new Error("expected the adapter call to reject"); }
  catch (error) {
    if (!(error instanceof SourceContentAssessmentStageError)) throw error;
    return error.stage;
  }
};

describe("AgentRuntimeSourceContentQualityReviewerAdapter failure stage classification", () => {
  it("classifies a transport call failure as runtime_status when the call itself throws", async () => {
    const client = refreshTestRuntimeClient(async () => { throw new Error("synthetic transport outage"); });
    const stage = await stageOf(adapterFor(client).reviewBatch([request()]));
    expect(stage).toBe("runtime_status");
  });

  it("classifies a transport call failure as aborted when the caller signal was already aborted", async () => {
    const client = refreshTestRuntimeClient(async () => { throw new Error("synthetic transport outage"); });
    const controller = new AbortController();
    controller.abort();
    const stage = await stageOf(adapterFor(client).reviewBatch([request()], { signal: controller.signal }));
    expect(stage).toBe("aborted");
  });

  it("classifies an attested-but-invalid completion (wrong status) as runtime_status", async () => {
    const client = refreshTestRuntimeClient(async (r) => ({
      ...(await attestRefreshExecution(r, { reviews: [] })), status: "failed",
    }));
    const stage = await stageOf(adapterFor(client).reviewBatch([request()]));
    expect(stage).toBe("runtime_status");
  });

  it("classifies mismatched request scope as runtime_status before any call is made", async () => {
    const client = refreshTestRuntimeClient(async () => { throw new Error("must not be reached"); });
    const mismatched: SourceContentQualityReviewRequest = { ...request("other"),
      promotion: { ...request("other").promotion!, workspaceId: "different-workspace" } };
    const stage = await stageOf(adapterFor(client).reviewBatch([request(), mismatched]));
    expect(stage).toBe("runtime_status");
  });

  it("classifies a JSON/schema-invalid structured output as parse_schema", async () => {
    const client = refreshTestRuntimeClient(async (r) => attestRefreshExecution(r, { reviews: "not-an-array" }));
    const stage = await stageOf(adapterFor(client).reviewBatch([request()]));
    expect(stage).toBe("parse_schema");
  });

  // Legitimate model binding drift: the whole-batch execution attestation
  // already proves the runtime executed exactly this candidate's content for
  // a fresh requestId, so an imperfect bindingId echo (a model failing to
  // reproduce the opaque 64-hex-char hash byte-for-byte) must not reject an
  // otherwise-correct, correctly-identified assessment.
  it("accepts a response with a mismatched bindingId once the request-level attestation is trusted", async () => {
    const input = request();
    const client = refreshTestRuntimeClient(async (r) => attestRefreshExecution(r,
      { reviews: [{ ...validReview(input), bindingId: `${promotionWireCandidate(input).bindingId}-drifted` }] }));
    const [result] = await adapterFor(client).reviewBatch([input]);
    expect(result!.decision).toBe("promote");
    expect(result!.assessment!.binding).toBe(input.promotion);
  });

  // Malicious candidate remap: a response can carry a valid candidateId and
  // an attested batch, but the assessment for candidate A must still be
  // rejected downstream if the caller ever accepted attention-content that
  // does not actually belong to A. This adapter alone (unlike the caller's
  // full verdict pipeline) does not itself verify evidence-quote content, so
  // it cannot detect a same-request content swap; that boundary is proven in
  // reader-summary-new-input-refresh-assessment-capture.spec.ts.
  it("still rejects an unknown candidateId even when the request-level attestation is trusted", async () => {
    const input = request();
    const client = refreshTestRuntimeClient(async (r) => attestRefreshExecution(r,
      { reviews: [{ ...validReview(input), candidateId: "not-a-real-candidate" }] }));
    const stage = await stageOf(adapterFor(client).reviewBatch([input]));
    expect(stage).toBe("parse_schema");
  });

  it("accepts a fully valid attested completion without throwing", async () => {
    const input = request();
    const client = refreshTestRuntimeClient(async (r) =>
      attestRefreshExecution(r, { reviews: [validReview(input)] }));
    const [result] = await adapterFor(client).reviewBatch([input]);
    expect(result!.decision).toBe("promote");
  });
});
