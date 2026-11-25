import type { ReaderPostPresentationV3Input } from "../../domain/services/reader-post-presentation-v3";
import { dispatchOpenAiPromotionPresentationBatch } from "./openai-promotion-presentation-v3-batch-admission";
import { sealOpenAiPromotionPresentationV3Proposals } from "./openai-promotion-presentation-v3-result-policy";

const candidate = (index: number, body = "Source body"): ReaderPostPresentationV3Input => ({
  tenantId: "tenant", workspaceId: "workspace", interestId: "interest",
  candidateId: `candidate-${index}`, sourceItemId: `source-${index}`,
  sourceBindingId: `binding-${index}`, providerKey: "reddit",
  trustedIntent: "intent", sourceSnapshotSha256: "1".repeat(64),
  title: `title-${index}`, body, captureComplete: true,
});

describe("OpenAI V3 provider-independent batch admission", () => {
  it("dispatches a small exact encoded request once without splitting", async () => {
    const input = candidate(1);
    const buildSubset = jest.fn();
    const executeWithinBudget = jest.fn(async () => [
      { status: "unavailable" as const, reason: "insufficient_support" as const },
    ]);
    const results = await dispatchOpenAiPromotionPresentationBatch({
      inputs: [input], model: "gpt-5.4-mini", buildSubset, executeWithinBudget,
    });
    expect(results).toEqual([{ status: "unavailable", reason: "insufficient_support" }]);
    expect(buildSubset).not.toHaveBeenCalled();
    expect(executeWithinBudget).toHaveBeenCalledTimes(1);
    const [submitted, body] = executeWithinBudget.mock.calls[0] as unknown as
      [readonly ReaderPostPresentationV3Input[], string];
    expect(submitted).toEqual([input]);
    const encoded = JSON.parse(body) as { model: string; input: string; store: boolean };
    expect(encoded.model).toBe("gpt-5.4-mini");
    expect(encoded.store).toBe(false);
    expect(JSON.parse(encoded.input)).toEqual({
      candidates: [{ candidateId: input.candidateId, title: input.title, sourceText: input.body }],
    });
  });

  it("splits an over-budget four-item batch in stable left-to-right order", async () => {
    const inputs = [1, 2, 3, 4].map((i) => candidate(i, "\u0000".repeat(64_000)));
    const executeWithinBudget = jest.fn();
    const buildSubset = jest.fn(async (subset: readonly ReaderPostPresentationV3Input[]) =>
      subset.map(() => ({ status: "unavailable" as const, reason: "insufficient_support" as const })));
    const results = await dispatchOpenAiPromotionPresentationBatch({
      inputs, model: "gpt-5.4-mini", buildSubset, executeWithinBudget,
    });
    expect(results).toHaveLength(4);
    expect(buildSubset.mock.calls.map(([subset]) => subset.map((i) => i.candidateId)))
      .toEqual([["candidate-1", "candidate-2"], ["candidate-3", "candidate-4"]]);
    expect(executeWithinBudget).not.toHaveBeenCalled();
  });

  it("rejects a single over-budget encoded request before provider dispatch", async () => {
    const executeWithinBudget = jest.fn();
    const buildSubset = jest.fn();
    const results = await dispatchOpenAiPromotionPresentationBatch({
      inputs: [candidate(1, "\u0000".repeat(250_000))],
      model: "gpt-5.4-mini", buildSubset, executeWithinBudget,
    });
    expect(results).toEqual([{ status: "unavailable", reason: "input_over_budget" }]);
    expect(executeWithinBudget).not.toHaveBeenCalled();
    expect(buildSubset).not.toHaveBeenCalled();
  });
});

describe("OpenAI V3 trusted result sealing", () => {
  it("matches responses by candidate ID, not untrusted provider order", () => {
    const inputs = [candidate(1), candidate(2)];
    const proposals = new Map<string, Record<string, unknown>>([
      ["candidate-2", { status: "available", kind: "claim", text: "Unsupported",
        support: [], qualifications: [], confidence: 0.9,
        qualificationJudgment: "none" }],
      ["candidate-1", { status: "unavailable" }],
    ]);
    const results = sealOpenAiPromotionPresentationV3Proposals(inputs, proposals);
    expect(results[0]).toEqual({ status: "unavailable", reason: "insufficient_support" });
    expect(results[1]).toMatchObject({ status: "unavailable", reason: "invalid_presentation" });
  });
});
