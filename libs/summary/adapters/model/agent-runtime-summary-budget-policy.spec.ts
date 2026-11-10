import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type {
  SummaryModelBudget,
  SummaryModelInput,
  SummaryModelPolicy,
} from "../../ports";
import {
  assertAgentRuntimeSummaryWithinBudget,
  estimateAgentRuntimeSummaryUsage,
} from "./agent-runtime-summary-budget-policy";
import { buildPromptPayload } from "./openai-responses-summary-prompt";

describe("Agent Runtime summary budget policy", () => {
  const policy: SummaryModelPolicy = {
    preferredProvider: "agent-runtime",
    maxInputTokens: 100,
    maxOutputTokens: 200,
    maxEstimatedCostUsd: 0.5,
  };
  const budget: SummaryModelBudget = {
    remainingTokens: 300,
    remainingCostUsd: 0.5,
  };
  const estimate = {
    inputTokens: 100,
    outputTokens: 200,
    estimatedCostUsd: 0.5,
  };

  it("admits every bound exactly at the inclusive limit", () => {
    expect(() => assertAgentRuntimeSummaryWithinBudget(
      estimate, policy, budget,
    )).not.toThrow();
  });

  it.each([
    { label: "input cap", policy: { maxInputTokens: 99 }, budget: {} },
    { label: "output cap", policy: { maxOutputTokens: 199 }, budget: {} },
    { label: "policy cost", policy: { maxEstimatedCostUsd: 0.49 }, budget: {} },
    { label: "remaining tokens", policy: {}, budget: { remainingTokens: 299 } },
    { label: "remaining cost", policy: {}, budget: { remainingCostUsd: 0.49 } },
  ])("fails closed when $label is exceeded", ({ policy: override, budget: limit }) => {
    expect(() => assertAgentRuntimeSummaryWithinBudget(
      estimate, { ...policy, ...override }, { ...budget, ...limit },
    )).toThrow("Summary model budget exceeded");
  });

  it("preserves exact prompt-length estimate and no-evidence reserve", () => {
    const input = buildInput(false);
    expect(estimateAgentRuntimeSummaryUsage(input, 4, 1000)).toEqual({
      inputTokens: Math.ceil(buildPromptPayload(input).length / 4),
      outputTokens: 96,
      estimatedCostUsd: 0,
    });
  });

  it("keeps source-backed output floor and max-token cap deterministic", () => {
    const input = buildInput(true);
    const length = Math.ceil(buildPromptPayload(input).length / 5);
    expect(estimateAgentRuntimeSummaryUsage(input, 5, 400)).toEqual({
      inputTokens: length,
      outputTokens: 400,
      estimatedCostUsd: 0,
    });
    expect(estimateAgentRuntimeSummaryUsage(input, 5, 1000).outputTokens).toBe(660);
  });
});

const buildInput = (withEvidence: boolean): SummaryModelInput => {
  const now = new Date("2026-06-21T10:00:00.000Z");
  const items = withEvidence ? [{
    feedItemId: "synthetic-feed",
    sourceItemId: "synthetic-source",
    sourceBindingId: "synthetic-binding",
    providerKey: "github",
    title: "Synthetic summary evidence",
    bodyPreview: "Model-free regression fixture",
    canonicalUrl: "https://example.test/source",
    observedAt: now,
  }] : [];

  return {
    tenantId: tenantId("tenant-summary-budget"),
    workspaceId: workspaceId("workspace-summary-budget"),
    interestId: "synthetic-interest",
    evidence: {
      sourceWindow: {
        windowId: "synthetic-window",
        startedAt: new Date("2026-06-21T09:00:00.000Z"),
        endedAt: now,
        selectedFeedItemIds: items.map((item) => item.feedItemId),
      },
      items,
    },
    policy: {
      language: "en",
      format: "executive_brief",
      tone: "concise",
      maxKeyPoints: 3,
      includeRisks: true,
      includeSourceHighlights: true,
      rulesVersion: "summary.rules.policy.v1",
    },
    requestedAt: now,
  };
};
