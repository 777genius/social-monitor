import {
  dailyEditorialCoveragePlan,
  primaryReaderSummaryEvidence,
  validateDailyEditorialPlan,
  type ReaderSummaryCitation,
} from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { dailyDigestFixture } from "./reader-summary-daily-digest.fixture";
import { normalizeDailyEditorialStories } from "./openai-responses-reader-summary-daily-editorial-stories";

const fixture = async () => {
  const { input, evidence } = await dailyDigestFixture();
  const frozen = evidence.dailyGenerationInput;
  if (frozen === undefined) throw new Error("Expected frozen daily evidence");
  const anchors = [frozen.selected[5]!, frozen.selected[0]!];
  const plan = validateDailyEditorialPlan({
    version: "reader_summary.daily_editorial.v2",
    topics: anchors.map((anchor, index) => ({
      title: `Planned topic ${index + 1}`,
      why: "Source-specific evidence",
      depth: index === 0 ? "detailed" : "brief",
      feedItemIds: [anchor.feedItemId],
    })),
  }, frozen);
  const writer: ReaderSummaryModelInput = {
    ...input,
    dailyEditorialPlan: plan,
    coveragePlan: dailyEditorialCoveragePlan(plan, evidence),
  };
  const citations: readonly ReaderSummaryCitation[] = frozen.selected.map((source, index) => ({
    citationId: `c${index + 1}`,
    feedItemId: source.feedItemId,
    sourceItemId: source.sourceItemId,
    providerKey: source.providerKey,
    field: "title",
    canonicalUrl: `https://example.com/source/${index + 1}`,
  }));
  const stories = anchors.map((anchor, index) => ({
    storyClusterId: anchor.storyId,
    title: `Authored story ${index + 1}`,
    summary: `Source-bound summary ${index + 1}`,
    citationIds: [`c${index === 0 ? 6 : 1}`],
    interestIds: ["forged-interest"],
    providerKeys: ["forged-provider"],
  }));
  return { writer, frozen, anchors, stories, citations };
};

describe("daily editorial story normalization trust boundary", () => {
  let data: Awaited<ReturnType<typeof fixture>>;
  beforeAll(async () => { data = await fixture(); });

  it("keeps planned order and overwrites model-supplied identities with cited evidence", () => {
    const stories = normalizeDailyEditorialStories(data.stories, data.writer, data.citations);
    expect(stories.map((story) => story.storyClusterId)).toEqual(data.anchors.map((a) => a.storyId));
    expect(stories.map((story) => story.citationIds)).toEqual([["c6"], ["c1"]]);
    const evidence = primaryReaderSummaryEvidence(data.writer.evidence).selectedEvidence;
    for (let index = 0; index < stories.length; index += 1) {
      const source = evidence.find((item) => item.feedItemId === data.anchors[index]!.feedItemId);
      expect(source).toBeDefined();
      expect(stories[index]!.interestIds).toEqual([source!.interestId]);
      expect(stories[index]!.providerKeys).toEqual([source!.providerKey]);
      expect(stories[index]!.readerReasonProvenance?.kind).toBe("model");
    }
  });

  it("rejects missing plan, frozen input and a missing planned topic", () => {
    expect(() => normalizeDailyEditorialStories(data.stories, {
      ...data.writer, dailyEditorialPlan: undefined,
    }, data.citations)).toThrow("Daily editorial stories must match the plan");
    expect(() => normalizeDailyEditorialStories(data.stories, {
      ...data.writer,
      evidence: { ...data.writer.evidence, dailyGenerationInput: undefined },
    }, data.citations)).toThrow("Daily editorial stories must match the plan");
    expect(() => normalizeDailyEditorialStories(data.stories.slice(1), data.writer, data.citations))
      .toThrow("Daily editorial stories must match the plan");
  });

  it("rejects an invented cluster, unplanned citation and multi-citation model story", () => {
    const first = data.stories[0]!;
    for (const invalid of [
      { ...first, storyClusterId: "model-invented-story" },
      { ...first, citationIds: ["c2"] },
      { ...first, citationIds: ["c6", "c1"] },
    ]) {
      expect(() => normalizeDailyEditorialStories([invalid, data.stories[1]!], data.writer, data.citations))
        .toThrow("Daily editorial story is missing or cites an unplanned source");
    }
  });

  it("rejects synthetic fallback text instead of upgrading it into model provenance", () => {
    const missingSummary = { ...data.stories[0]!, summary: "" };
    expect(() => normalizeDailyEditorialStories([missingSummary, data.stories[1]!], data.writer, data.citations))
      .toThrow("Daily editorial story is missing or cites an unplanned source");
  });
});
