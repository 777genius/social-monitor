import { headlineRequest } from "../../test/support/promotion-reader-headline";
import { promotionReviewInstructions, promotionWireCandidate } from "@social-monitor/relevance/adapters/model/promotion-review-wire";
import { parseReviews, promotionResponseSchema } from "@social-monitor/relevance/adapters/model/source-content-quality-review-wire";
import { refreshModelCommand } from "./reader-summary-new-input-refresh-model.spec-support";
import { sourceContentAssessmentPurpose } from "./reader-summary-new-input-refresh-assessment-runtime";
import type { AgentRuntimeTaskCommand } from "@social-monitor/summary/ports";

import { RefreshPairedExport } from "./reader-summary-new-input-refresh-paired-export";
import type { RefreshAssessmentCaptureEvent } from "./reader-summary-new-input-refresh-assessment";

// Synthetic validation-only fixture. No producer provenance or replay certification.
function coverage() {
  const binding = { tenantId: "synthetic-tenant", workspaceId: "synthetic-workspace",
    sourceItemId: "source", sourceBindingId: "binding", interestId: "interest" };
  const verdict = { reason: "promotion_assessment:reject", decision: "reject", qualityScore: 0.7,
    eligibleForSummary: false, eligibleForTopRead: false, needsLlmReview: false };
  const item = { id: "feed", ...binding, providerKey: "reddit", title: "Synthetic title", bodyPreview: "Synthetic body" };
  const ranked = { ...item, feedItemId: item.id, contentQuality: verdict };
  const request = { candidateId: item.id, providerKey: item.providerKey, title: item.title,
    bodyPreview: item.bodyPreview, promotion: binding };
  const attempt: RefreshAssessmentCaptureEvent = { phase: "attempt", batch: 1, atMs: 1,
    requestsJson: JSON.stringify([request]), consumed: false };
  const terminal: RefreshAssessmentCaptureEvent = { ...attempt, phase: "completed", atMs: 2, consumed: true,
    reviewsJson: JSON.stringify([{ candidateId: item.id }]),
    verdictsJson: JSON.stringify([{ candidateId: item.id, verdict }]) };
  const capture = Object.assign(Object.create(RefreshPairedExport.prototype) as {
    validateAssessmentCoverage(): void;
  }, {
    scope: { ...binding }, raw: { candidates: [{ item: { toSnapshot: () => item } }] },
    promotion: { ranked: { primary: [ranked], supplemental: [], requestedCandidateIds: [item.id] } },
    assessments: [attempt, terminal],
  });
  return { capture, attempt, terminal, request, ranked };
}

describe("synthetic assessment export coverage checks", () => {
  it("accepts actual rejection semantics as a completed attempted request", () => {
    expect(() => coverage().capture.validateAssessmentCoverage()).not.toThrow();
  });
  it.each(["scope", "source", "text", "terminal request", "verdict", "duplicate", "partial", "missing parser"])(
    "rejects %s mismatch independently of sidecar hashes", (kind) => {
      const test = coverage();
      switch (kind) {
        case "scope": test.request.promotion.tenantId = "other"; break;
        case "source": test.request.promotion.sourceItemId = "other"; break;
        case "text": test.request.bodyPreview = "other"; break;
        case "terminal request": test.terminal = { ...test.terminal, requestsJson: "[]" }; break;
        case "verdict": test.ranked.contentQuality = { ...test.ranked.contentQuality, decision: "promote" }; break;
        case "missing parser": test.terminal = { ...test.terminal, reviewsJson: undefined }; break;
      }
      const attempt = kind === "scope" || kind === "source" || kind === "text"
        ? { ...test.attempt, requestsJson: JSON.stringify([test.request]) } : test.attempt;
      Object.assign(test.capture, { assessments: kind === "duplicate" ? [attempt, attempt, test.terminal]
        : kind === "partial" ? [attempt] : [attempt, test.terminal] });
      expect(() => test.capture.validateAssessmentCoverage()).toThrow();
    });
  it("keeps eligible budget-skipped input pending without inventing an attempt", () => {
    const test = coverage();
    test.ranked.contentQuality = { ...test.ranked.contentQuality, reason: "promotion_assessment_pending:budget_exhausted",
      decision: "needs_context", needsLlmReview: true, qualityScore: 0 };
    Object.assign(test.capture, { assessments: [] });
    expect(() => test.capture.validateAssessmentCoverage()).not.toThrow();
  });
  it("refuses a resolved rank result without its completed attempt", () => {
    const test = coverage();
    Object.assign(test.capture, { assessments: [] });
    expect(() => test.capture.validateAssessmentCoverage()).toThrow(/Missing actual assessment completion/u);
  });
});


function modelCoverage() {
  const request = headlineRequest();
  const wire = promotionWireCandidate(request);
  const command = { ...refreshModelCommand(sourceContentAssessmentPurpose),
    prompt: JSON.stringify({ candidates: [wire] }), systemPrompt: promotionReviewInstructions,
    outputSchema: promotionResponseSchema, controls: { outputSchemaName: "social_monitor_source_content_quality_review",
      schemaVersion: "source_content_assessment.v1" } };
  const attempt: RefreshAssessmentCaptureEvent = { phase: "attempt", batch: 1, atMs: 1,
    requestsJson: JSON.stringify([request]), consumed: false };
  const output = { reviews: [{ candidateId: request.candidateId, bindingId: wire.bindingId,
    confidence: 0.95, decision: "reject", qualityScore: 0.4, interestRelevanceScore: 0.4,
    engagementIntegrityScore: 0.4, flags: [], reason: "Synthetic rejection", evidence: [], resolvedSoftFlags: [] }] };
  const terminal: RefreshAssessmentCaptureEvent = { ...attempt, phase: "completed", consumed: true,
    reviewsJson: JSON.stringify(parseReviews(JSON.stringify(output), [request])) };
  const capture = Object.assign(Object.create(RefreshPairedExport.prototype) as {
    validateAssessmentModel(command: AgentRuntimeTaskCommand, batch: number): void;
    validateAssessmentParser(event: RefreshAssessmentCaptureEvent): void;
  }, { assessments: [attempt], assessmentModelIds: new Map([[1, [command.requestId]]]),
    models: [{ kind: "envelope_verified", command, result: { structuredOutput: output } }] });
  return { capture, command, terminal, output };
}

describe("synthetic concrete assessment wire and parser capture binding", () => {
  it("reconstructs the exact command and parsed output without invoking a provider", () => {
    const test = modelCoverage();
    expect(() => test.capture.validateAssessmentModel(test.command, 1)).not.toThrow();
    expect(() => test.capture.validateAssessmentParser(test.terminal)).not.toThrow();
  });
  it.each(["prompt", "system", "schema", "binding", "parsed result"])("rejects changed %s bytes", (kind) => {
    const test = modelCoverage();
    if (kind === "prompt") test.command.prompt = "{}";
    if (kind === "system") test.command.systemPrompt = "Changed instructions";
    if (kind === "schema") Object.assign(test.command, { outputSchema: {} });
    if (kind === "binding") test.output.reviews[0]!.bindingId = "changed";
    if (kind === "parsed result") test.terminal = { ...test.terminal, reviewsJson: "[]" };
    expect(() => test.capture.validateAssessmentParser(test.terminal)).toThrow();
  });
});
