import { DAILY_EDITORIAL_PLAN_VERSION, validateDailyEditorialPlan } from "./reader-summary-daily-editorial-plan";
import type { ReaderSummaryDailyGenerationInput } from "../value-objects/reader-summary-daily-generation-input";

const frozen: ReaderSummaryDailyGenerationInput = {
  policyVersion: "reader_summary.daily_input.native_likes.v1",
  manifestSha256: "a".repeat(64), periodKey: "2026-11-01",
  cutoffAt: "2026-11-02T00:00:00Z", candidateCount: 30,
  selected: Array.from({ length: 30 }, (_, index) => ({
    feedItemId: `feed-${index + 1}`, sourceItemId: `source-${index + 1}`,
    interestId: "interest", assessmentId: `assessment-${index + 1}`,
    publishedAt: "2026-11-01T12:00:00Z", observedAt: "2026-11-01T13:00:00Z",
    sourceSnapshotSha256: "b".repeat(64), inputSha256: "c".repeat(64),
    storyId: `story-${index + 1}`, providerKey: "x-twitter",
    nativeCount: 30 - index, engagementObservedAt: "2026-11-01T13:00:00Z",
  })), excluded: [],
};
const topic = (feedItemIds: string[], depth: "detailed" | "brief" = "brief") =>
  ({ title: "A concrete event", why: "Why this matters", depth, feedItemIds });
const plan = (topics: ReturnType<typeof topic>[]) =>
  ({ version: DAILY_EDITORIAL_PLAN_VERSION, topics });

it("accepts a later source as lead, groups cross-cluster sources and keeps their order", () => {
  const result = validateDailyEditorialPlan(plan([
    topic(["feed-20", "feed-27"], "detailed"), topic(["feed-1"]),
  ]), frozen);
  expect(result.topics[0]?.feedItemIds).toEqual(["feed-20", "feed-27"]);
  expect(result.topics[1]?.feedItemIds).toEqual(["feed-1"]);
});

it("accepts one or ten topics without filling gaps", () => {
  expect(validateDailyEditorialPlan(plan([topic(["feed-30"], "detailed")]), frozen).topics).toHaveLength(1);
  expect(validateDailyEditorialPlan(plan(Array.from({length:10},(_,i) =>
    topic([`feed-${i+1}`], i===0?"detailed":"brief"))), frozen).topics).toHaveLength(10);
});

it("rejects invalid shape, source references, duplicate assignments and oversized plans", () => {
  const valid = plan([topic(["feed-1"], "detailed")]);
  const invalid = [
    { ...valid, version: "unexpected" },
    { ...valid, topics: [] },
    plan(Array.from({length:11},(_,i)=>topic([`feed-${i+1}`],i===0?"detailed":"brief"))),
    plan([topic(["feed-unknown"], "detailed")]),
    plan([topic(["feed-1", "feed-1"], "detailed")]),
    plan([topic(["feed-1"], "detailed"), topic(["feed-1"])]),
    plan([topic(["feed-1"])]),
    { ...valid, topics: [{ ...valid.topics[0], other: "untrusted" }] },
  ];
  for (const candidate of invalid) expect(() => validateDailyEditorialPlan(candidate, frozen)).toThrow();
});
