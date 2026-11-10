import type { AgentRuntimeClientPort, GeneratedSummaryDraft, ProviderSummaryAttempt } from "../../ports";
import { resolveAgentRuntimeSummaryModelOptions } from "./agent-runtime-summary-model.adapter";
import { validateAgentRuntimeSummaryProviderResponse } from "./agent-runtime-summary-response-validation";

// The options resolver never calls the client; no live runtime is used.
const unusedClient = {} as AgentRuntimeClientPort;

const validDraft: GeneratedSummaryDraft = {
  headline: "Selected source",
  executiveSummary: "One bounded synthetic signal.",
  keyPoints: [],
  risksAndUnknowns: [],
  sourceHighlights: [],
  citationMap: [],
  qualityFlags: ["no_signal"],
  confidence: { level: "none", score: 0, rationale: "No evidence" },
  lineage: {
    promptVersion: "summary.prompt.test.v1",
    schemaVersion: "summary.artifact.v1",
    modelVersion: "codex:summary-test",
    providerVersion: "agent-runtime",
    rulesVersion: "summary.rules.test.v1",
    evalDatasetVersion: "summary.eval.test.v1",
  },
  usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 },
  noSignalReason: "No eligible evidence",
};
const validAttempt: ProviderSummaryAttempt = {
  route: { provider: "agent-runtime", model: "codex:summary-test",
    promptVersion: "summary.prompt.test.v1", schemaVersion: "summary.artifact.v1" },
  draft: validDraft,
};

describe("agent-runtime generic summary configuration policy", () => {
  it.each([undefined, "", "  "])("preserves the unselected provider for %p", (value) => {
    expect(resolveAgentRuntimeSummaryModelOptions({ AGENT_RUNTIME_PROVIDER: value }, unusedClient).agentProvider)
      .toBeUndefined();
  });

  it.each(["codex", "claude"])("accepts the exact supported provider %s", (value) => {
    expect(resolveAgentRuntimeSummaryModelOptions({ AGENT_RUNTIME_PROVIDER: value }, unusedClient).agentProvider)
      .toBe(value);
  });

  it.each(["codex ", "not-supported"])("rejects noncanonical provider %s", (value) => {
    expect(() => resolveAgentRuntimeSummaryModelOptions({ AGENT_RUNTIME_PROVIDER: value }, unusedClient))
      .toThrow('AGENT_RUNTIME_PROVIDER must be "codex" or "claude"');
  });

  it("does not apply gateway identity policy when the CLI transport is selected", () => {
    const options = resolveAgentRuntimeSummaryModelOptions({
      AGENT_RUNTIME_TRANSPORT: "cli",
      AGENT_RUNTIME_PROVIDER: "claude",
      AGENT_RUNTIME_SUMMARY_MODEL: "summary-test",
      AGENT_RUNTIME_SUMMARY_REASONING_EFFORT: "conflicting",
    }, unusedClient);
    expect(options).toMatchObject({ agentProvider: "claude", model: "summary-test" });
    expect(options.modelBackend).toBeUndefined();
  });

  it("rejects a gateway override that conflicts with the canonical effort", () => {
    expect(() => resolveAgentRuntimeSummaryModelOptions({
      AGENT_RUNTIME_TRANSPORT: "gateway-llm",
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "openai-chatgpt",
      AGENT_RUNTIME_SUMMARY_REASONING_EFFORT: "high",
    }, unusedClient)).toThrow("Gateway summary reasoning effort conflicts with purpose policy");
  });
});

describe("agent-runtime summary provider response contract", () => {
  it("accepts a fully normalized, no-signal draft on its canonical route", () => {
    expect(validateAgentRuntimeSummaryProviderResponse(validAttempt)).toEqual({ ok: true });
  });

  it("rejects the wrong provider after validating the draft", () => {
    expect(validateAgentRuntimeSummaryProviderResponse({
      ...validAttempt, route: { ...validAttempt.route, provider: "openai-responses" },
    })).toEqual({ ok: false, failure: { kind: "invalid_schema", retryable: false,
      message: "Unexpected summary provider route" } });
  });

  it("rejects a schema mismatch without widening accepted versions", () => {
    expect(validateAgentRuntimeSummaryProviderResponse({
      ...validAttempt, route: { ...validAttempt.route, schemaVersion: "unknown" as ProviderSummaryAttempt["route"]["schemaVersion"] },
    })).toEqual({ ok: false, failure: { kind: "invalid_schema", retryable: false,
      message: "Unsupported summary schema version" } });
  });

  it("retains fail-closed draft validation before route checks", () => {
    expect(validateAgentRuntimeSummaryProviderResponse({
      ...validAttempt, draft: { ...validDraft, headline: "" },
      route: { ...validAttempt.route, schemaVersion: "unknown" as ProviderSummaryAttempt["route"]["schemaVersion"] },
    })).toEqual({ ok: false, failure: { kind: "invalid_schema", retryable: false,
      message: "Summary headline must be non-empty" } });
  });
});
