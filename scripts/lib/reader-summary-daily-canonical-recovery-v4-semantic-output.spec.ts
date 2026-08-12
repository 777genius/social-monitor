import { openAiReaderSummaryJsonSchema } from "@social-monitor/summary/adapters/model/openai-responses-reader-summary-schema";

import {
  assertDailyCanonicalRecoveryOutputSemanticValidity,
  assertDailyOutputContentAndSignalValidity,
  canonicalJsonBytes,
  dailyCanonicalRecoveryOutputTextMaxBytes,
  parseDailyCanonicalRecoveryOutputText,
} from "./reader-summary-daily-canonical-recovery-v4-semantic-output";

describe("daily canonical recovery v4 semantic output", () => {
  it("accepts reordered and outer-whitespace output_text into identical canonical bytes", () => {
    const value = validOutput();
    const canonical = canonicalJsonBytes(value);
    const reordered = Buffer.from(`\n  ${JSON.stringify(
      Object.fromEntries(Object.entries(value).reverse()),
    )}\t`, "utf8");

    const accepted = parseDailyCanonicalRecoveryOutputText(reordered);

    expect(accepted.canonicalBytes).toEqual(canonical);
    expect(accepted.canonicalBytes).not.toEqual(reordered);
    expect(Object.keys(accepted)).toEqual(["canonicalBytes", "output"]);
  });

  it.each([
    ["malformed", Buffer.from('{"headline":', "utf8")],
    ["missing", Buffer.from(JSON.stringify(without("headline")), "utf8")],
    ["extra", Buffer.from(JSON.stringify({ ...validOutput(), extra: true }), "utf8")],
    ["duplicate", Buffer.from(`{"headline":"forged",${JSON.stringify(validOutput()).slice(1)}`, "utf8")],
    ["invalid UTF-8", Buffer.from([0x7b, 0xff, 0x7d])],
    ["oversized", Buffer.alloc(dailyCanonicalRecoveryOutputTextMaxBytes + 1, 0x20)],
  ])("rejects %s output framing", (_name, bytes) => {
    expect(() => parseDailyCanonicalRecoveryOutputText(bytes)).toThrow();
  });

  it("rejects schema, citation, source-hash, and cross-field signal forgeries", () => {
    const schemaInvalid = { ...validOutput(), headline: 42 };
    expect(() => assertDailyCanonicalRecoveryOutputSemanticValidity({
      output: schemaInvalid,
      sourceAuthorityBytes: authority([]),
      schema: openAiReaderSummaryJsonSchema,
      citationSelectionLimit: 200,
    })).toThrow(/schema/u);

    const citationInvalid = {
      ...validOutput(),
      citationMap: [citation("c1")],
    };
    expect(() => assertDailyCanonicalRecoveryOutputSemanticValidity({
      output: citationInvalid,
      sourceAuthorityBytes: authority([]),
      schema: openAiReaderSummaryJsonSchema,
      citationSelectionLimit: 200,
    })).toThrow(/citationMap|authority/u);

    expect(() => assertDailyCanonicalRecoveryOutputSemanticValidity({
      output: citationInvalid,
      sourceAuthorityBytes: authority([{ ...sourceItem(), contentHash: "not-a-hash" }]),
      schema: openAiReaderSummaryJsonSchema,
      citationSelectionLimit: 200,
    })).toThrow(/authority/u);

    const signalInvalid = {
      ...validOutput(),
      citationMap: [citation("c1")],
      topStories: [{
        storyClusterId: "story-1",
        title: "Signal",
        summary: "A valid-looking but contradictory signal.",
        interestIds: [],
        providerKeys: [],
        citationIds: ["c1"],
      }],
    };
    expect(() => assertDailyCanonicalRecoveryOutputSemanticValidity({
      output: signalInvalid,
      sourceAuthorityBytes: authority([sourceItem()]),
      schema: openAiReaderSummaryJsonSchema,
      citationSelectionLimit: 200,
    })).toThrow(/signal/u);
  });

  it.each([
    ["topStories", (output: ReturnType<typeof citedOutput>) => {
      output.topStories[0]!.citationIds = [];
    }],
    ["interestHighlights", (output: ReturnType<typeof citedOutput>) => {
      output.interestHighlights[0]!.citationIds = [];
    }],
    ["repeatedSignals", (output: ReturnType<typeof citedOutput>) => {
      output.repeatedSignals[0]!.citationIds = [];
    }],
    ["readerClaim", (output: ReturnType<typeof citedOutput>) => {
      output.content.claimBoard[0]!.citationIds = [];
    }],
  ])("rejects empty %s citations before no-signal validation", (label, mutate) => {
    const output = citedOutput();
    mutate(output);

    expect(() => assertDailyOutputContentAndSignalValidity(output)).toThrow(
      new RegExp(`${label}\\[0\\] citations must be non-empty`, "u"),
    );
  });

  it.each([
    ["topStories", (output: ReturnType<typeof citedOutput>) => {
      output.topStories[0]!.citationIds = ["c999"];
    }],
    ["interestHighlights", (output: ReturnType<typeof citedOutput>) => {
      output.interestHighlights[0]!.citationIds = ["c999"];
    }],
    ["repeatedSignals", (output: ReturnType<typeof citedOutput>) => {
      output.repeatedSignals[0]!.citationIds = ["c999"];
    }],
    ["readerClaim", (output: ReturnType<typeof citedOutput>) => {
      output.content.claimBoard[0]!.citationIds = ["c999"];
    }],
  ])("rejects unknown %s citation IDs", (label, mutate) => {
    const output = citedOutput();
    mutate(output);

    expect(() => assertDailyOutputContentAndSignalValidity(output)).toThrow(
      new RegExp(`${label}\\[0\\] references an unknown citation`, "u"),
    );
  });
});

function without(key: string): Record<string, unknown> {
  const { [key]: _removed, ...rest } = validOutput();
  return rest;
}

function authority(items: readonly Record<string, unknown>[]): Buffer {
  return canonicalJsonBytes({ items });
}

function sourceItem() {
  return {
  feedItemId: "feed-1",
  sourceItemId: "source-1",
  providerKey: "rss",
  title: "Frozen source",
  bodyPreview: "Frozen source preview",
  canonicalUrl: "https://example.test/frozen-source",
  contentHash: "a".repeat(64),
  };
}

function citation(citationId: string) {
  return {
  citationId,
  feedItemId: "feed-1",
  sourceItemId: "source-1",
  providerKey: "rss",
  field: "canonicalUrl",
  };
}

function citedOutput() {
  const output = validOutput();
  return {
    ...output,
    citationMap: [citation("c1")],
    content: {
      ...output.content,
      claimBoard: [{
        claim: "A cited claim.",
        evidence: [],
        confidence: { level: "low", score: 0, rationale: "One source." },
        risks: [],
        citationIds: ["c1"],
      }],
    },
    topStories: [{
      storyClusterId: "story-1",
      title: "Signal",
      summary: "A cited signal.",
      interestIds: [],
      providerKeys: [],
      citationIds: ["c1"],
    }],
    interestHighlights: [{
      interestId: "interest-1",
      title: "Interest signal",
      summary: "A cited interest signal.",
      citationIds: ["c1"],
    }],
    repeatedSignals: [{
      storyClusterId: "story-1",
      title: "Repeated signal",
      interestIds: [],
      citationIds: ["c1"],
    }],
    qualityFlags: [],
    noSignalReason: null,
  };
}

function validOutput() {
  return {
  headline: "Canonical day",
  executiveSummary: "Immutable evidence only.",
  narrativeSections: [],
  content: {
    headline: "Canonical day",
    oneLineTakeaway: "Immutable evidence only.",
    bullets: [],
    interestSections: [],
    sourceMix: [],
    topReads: [],
    claimBoard: [],
    reliabilityReport: {
      mode: "shadow",
      policyVersion: "reader_summary.reliability.v1",
      riskLevel: "low",
      riskScore: 0,
      risks: [],
    },
    trendDelta: {
      newSignals: [], growingSignals: [], repeatedSignals: [], fadingSignals: [],
    },
    openQuestions: [],
    risks: [],
    nextActions: [],
  },
  topStories: [],
  interestHighlights: [],
  repeatedSignals: [],
  risksAndUnknowns: [],
  citationMap: [],
  qualityFlags: ["no_signal"],
  confidence: { level: "low", score: 0, rationale: "No invention." },
  noSignalReason: "No immutable signal.",
  };
}
