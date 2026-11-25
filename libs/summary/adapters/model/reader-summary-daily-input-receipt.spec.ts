import { createHash } from "node:crypto";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { DailyEditorialPlan, ReaderSummaryDailyGenerationInput } from "../../domain";
import { admitFrozenReaderSummaryDailyPrompt } from "./reader-summary-daily-prompt-admission";
import { readerSummaryDailyInputReceipt } from "./reader-summary-daily-input-receipt";

const proof = {
  selected: [{ feedItemId: "feed-one" }, { feedItemId: "feed-two" }],
} as unknown as ReaderSummaryDailyGenerationInput;

const sha = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const evidence = [
  { feedItemId: "feed-one", headline: "A", providerKey: "reddit" },
  { feedItemId: "feed-two", headline: "B", providerKey: "github" },
];

describe("frozen daily writer prompt admission and input receipt", () => {
  it("preserves the exact content-bound receipt hashes and source ordering", () => {
    const prompt = JSON.stringify({ evidence, additionalEvidence: [], contextArtifacts: [] });
    expect(admitFrozenReaderSummaryDailyPrompt(prompt, proof).evidence).toEqual(evidence);
    expect(readerSummaryDailyInputReceipt(prompt, proof)).toEqual({
      payloadSha256: sha(prompt),
      evidence: evidence.map((entry) => ({
        feedItemId: entry.feedItemId,
        sha256: sha(JSON.stringify(entry)),
      })),
    });
  });

  it("retains the no-frozen-selection shortcut without parsing a prompt", () => {
    expect(readerSummaryDailyInputReceipt("not JSON", undefined)).toBeUndefined();
    expect(() => readerSummaryDailyInputReceipt("not JSON", proof)).toThrow();
  });

  it("rejects missing, reordered, extra or fabricated frozen source identities", () => {
    const inputs = [
      {},
      { evidence: [evidence[1], evidence[0]] },
      { evidence: [evidence[0]] },
      { evidence: [evidence[0], { ...evidence[1], feedItemId: "fabricated" }] },
      { evidence, additionalEvidence: [{ feedItemId: "forged" }] },
      { evidence, contextArtifacts: [{ injected: true }] },
    ];
    for (const input of inputs) {
      const prompt = JSON.stringify(input);
      expect(() => admitFrozenReaderSummaryDailyPrompt(prompt, proof))
        .toThrow("Daily model input differs from frozen generation selection");
      expect(() => readerSummaryDailyInputReceipt(prompt, proof))
        .toThrow("Daily model input differs from frozen generation selection");
    }
  });

  it("requires an identical prevalidated editorial plan and hashes the admitted plan", () => {
    const editorialPlan = {
      version: "reader_summary.daily_editorial.v2", topics: [{ title: "A", feedItemIds: ["feed-one"] }],
    } as unknown as DailyEditorialPlan;
    const matching = JSON.stringify({ evidence, dailyEditorialPlan: editorialPlan });
    expect(readerSummaryDailyInputReceipt(matching, proof, editorialPlan)).toEqual({
      payloadSha256: sha(matching),
      evidence: evidence.map((entry) => ({
        feedItemId: entry.feedItemId,
        sha256: sha(JSON.stringify(entry)),
      })),
      editorialPlanSha256: canonicalJsonSha256(editorialPlan),
    });
    expect(() => readerSummaryDailyInputReceipt(matching, proof))
      .toThrow("Daily writer prompt omitted the validated editorial plan");
    expect(() => readerSummaryDailyInputReceipt(JSON.stringify({ evidence }), proof, editorialPlan))
      .toThrow("Daily writer prompt omitted the validated editorial plan");
    expect(() => readerSummaryDailyInputReceipt(
      JSON.stringify({ evidence, dailyEditorialPlan: { version: "forged" } }),
      proof, editorialPlan,
    )).toThrow("Daily writer prompt omitted the validated editorial plan");
  });
});
