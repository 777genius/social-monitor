import { dailyDigestFixture } from "./reader-summary-daily-digest.fixture";
import { buildReaderSummaryDailyEditorPayload, dailyEditorReceipt, dailyEditorialSha256,
  assertDailyEditorialRawWriter } from "./reader-summary-daily-editor";
import { readReaderSummaryDailyEditorialPlan, readerSummaryDailyEditorialCoveragePlan,
  READER_SUMMARY_DAILY_EDITORIAL_VERSION,
  assertReaderSummaryDailyEditorialArticle, type ReaderSummaryDailyEditorialPlan,
  type ReaderSummaryDailyEditorialProof } from "../../domain";

const topic = (ids: readonly string[], depth: "detailed" | "brief" = "brief") => ({
  title: `Development from ${ids[0]}`, why: "Specific new capability and source evidence",
  depth, feedItemIds: ids,
});

it("reads all thirty frozen inputs and promotes a source after the sixth position", async () => {
  const { evidence } = await dailyDigestFixture();
  const frozen = evidence.dailyGenerationInput!;
  const payload = JSON.parse(buildReaderSummaryDailyEditorPayload(evidence)) as {
    evidence: { feedItemId: string; metric: { value: number | null; observedAt: string | null } }[];
  };
  expect(payload.evidence).toHaveLength(30);
  expect(payload.evidence.map(item => item.feedItemId)).toEqual(frozen.selected.map(item => item.feedItemId));
  expect(payload.evidence[0]!.metric.value).toBe(frozen.selected[0]!.nativeCount);
  const plan = readReaderSummaryDailyEditorialPlan({
    version: READER_SUMMARY_DAILY_EDITORIAL_VERSION,
    topics: [
      topic([frozen.selected[17]!.feedItemId, frozen.selected[8]!.feedItemId], "detailed"),
      topic([frozen.selected[0]!.feedItemId]),
    ],
  }, frozen);
  const coverage = readerSummaryDailyEditorialCoveragePlan(evidence, plan);
  expect(coverage.lead?.clusterId).toBe(frozen.selected[17]!.storyId);
  expect(coverage.lead?.feedItemIds).toEqual([frozen.selected[17]!.feedItemId, frozen.selected[8]!.feedItemId]);
  expect(coverage.secondary[0]?.clusterId).toBe(frozen.selected[0]!.storyId);
  expect(coverage.mode).toBe("single_story");
});

it("rejects unknown and duplicate frozen IDs, invalid leads and eleven topics", async () => {
  const { evidence } = await dailyDigestFixture();
  const frozen = evidence.dailyGenerationInput!;
  const ids = frozen.selected.map(item => item.feedItemId);
  const valid = { version: READER_SUMMARY_DAILY_EDITORIAL_VERSION,
    topics: [topic([ids[12]!], "detailed"), topic([ids[13]!])] };
  expect(() => readReaderSummaryDailyEditorialPlan(valid, frozen)).not.toThrow();
  for (const invalid of [
    { ...valid, topics: [topic([ids[12]!], "brief")] },
    { ...valid, topics: [topic(["some-other-feed-id"], "detailed")] },
    { ...valid, topics: [topic([ids[12]!, ids[12]!], "detailed")] },
    { ...valid, topics: [topic([ids[12]!], "detailed"), topic([ids[12]!])] },
    { ...valid, topics: ids.slice(0, 11).map((id, index) => topic([id], index ? "brief" : "detailed")) },
  ]) {
    expect(() => readReaderSummaryDailyEditorialPlan(invalid, frozen)).toThrow();
  }
  expect(() => readReaderSummaryDailyEditorialPlan({ ...valid,
    topics: [topic([ids[15]!], "detailed")] }, frozen).topics).not.toThrow();
});

it("checks raw and final writer sources per semantic topic across different clusters", async () => {
  const { evidence } = await dailyDigestFixture();
  const frozen = evidence.dailyGenerationInput!;
  const a = frozen.selected[16]!, b = frozen.selected[20]!, c = frozen.selected[2]!;
  const plan = readReaderSummaryDailyEditorialPlan({
    version: READER_SUMMARY_DAILY_EDITORIAL_VERSION,
    topics: [topic([a.feedItemId, b.feedItemId], "detailed"), topic([c.feedItemId])],
  }, frozen);
  const raw = {
    narrativeSections: [
      { kind: "lead", storyClusterId: a.storyId, citationIds: ["c17", "c21"] },
      { kind: "secondary_signal", storyClusterId: c.storyId, citationIds: ["c3"] },
    ],
    topStories: [
      { storyClusterId: a.storyId, citationIds: ["c17"] },
      { storyClusterId: c.storyId, citationIds: ["c3"] },
    ],
  };
  expect(() => assertDailyEditorialRawWriter(raw, evidence, plan)).not.toThrow();
  expect(() => assertDailyEditorialRawWriter({ ...raw,
    narrativeSections: [raw.narrativeSections[0]] }, evidence, plan)).toThrow();
  expect(() => assertDailyEditorialRawWriter({ ...raw, topStories: [
    { storyClusterId: a.storyId, citationIds: ["c3"] }, raw.topStories[1],
  ] }, evidence, plan)).toThrow();
  const req = buildReaderSummaryDailyEditorPayload(evidence);
  const proof: ReaderSummaryDailyEditorialProof = {
    plan, inputSha256: dailyEditorialSha256(JSON.stringify(frozen.selected)),
    editor: dailyEditorReceipt(req, plan), writerPlanSha256: dailyEditorialSha256(JSON.stringify(plan)),
  };
  const citations = evidence.selectedEvidence.map((item, index) => ({
    citationId: `c${index + 1}`, feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId, providerKey: item.providerKey, field: "canonicalUrl" as const,
  }));
  const sections = raw.narrativeSections.map((item, index) => ({
    ...item, id: `section-${index}`, title: "Covered event", text: "Grounded summary",
  }));
  const stories = raw.topStories.map(item => ({
    ...item, title: "Story", summary: "Description", interestIds: [], providerKeys: [],
  }));
  const params = { proof, input: frozen, stories, sections, citations } as unknown as
    Parameters<typeof assertReaderSummaryDailyEditorialArticle>[0];
  expect(() => assertReaderSummaryDailyEditorialArticle(params)).not.toThrow();
  expect(() => assertReaderSummaryDailyEditorialArticle({ ...params,
    sections: [{ ...params.sections[0]!, citationIds: ["c3"] }, params.sections[1]!] })).toThrow();
});
