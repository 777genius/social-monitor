import { dailyEditorialReaderSummaryJsonSchema, openAiReaderSummaryJsonSchema } from "./openai-responses-reader-summary-schema";
import { normalizeDailyEditorialNarrative } from "./openai-responses-reader-summary-editorial-narrative";
import { dailyDigestFixture } from "./reader-summary-daily-digest.fixture";
import { validateDailyEditorialPlan } from "../../domain";

it("keeps complete detailed paragraphs beyond the previous 720-character ceiling", async () => {
  const { input } = await dailyDigestFixture();
  const frozen = input.evidence.dailyGenerationInput!;
  const source = frozen.selected[0]!;
  const plan = validateDailyEditorialPlan({ version: "reader_summary.daily_editorial.v1",
    topics: [{ title: "Detailed source report", why: "Practical details matter",
      depth: "detailed", feedItemIds: [source.feedItemId] }],
  }, frozen);
  const text = `${"The source describes concrete steps and their limitations. ".repeat(16)}The result needs independent confirmation.`;
  const normalize = (value: string) => normalizeDailyEditorialNarrative({
    input: { ...input, dailyEditorialPlan: plan },
    citationMap: [{ citationId: "c1", feedItemId: source.feedItemId,
      sourceItemId: source.sourceItemId, providerKey: source.providerKey,
      canonicalUrl: "https://example.test/source", field: "bodyPreview" }],
    rawSections: [{ kind: "lead", title: plan.topics[0]!.title,
      storyClusterId: source.storyId, citationIds: ["c1"], text: value }],
  });
  expect(text.length).toBeGreaterThan(720);
  expect(normalize(text)[0]?.text).toBe(text);
  expect(() => normalize(text.slice(0, 719) + "x")).toThrow("unfinished");
  expect(() => normalize("x".repeat(1600) + ".")).toThrow("too long");
  expect(dailyEditorialReaderSummaryJsonSchema.$defs.narrativeSection.properties.text).toMatchObject({ maxLength: 1600 });
  expect(openAiReaderSummaryJsonSchema.$defs.narrativeSection.properties.text).toMatchObject({ maxLength: 720 });
});
