import { readerSummaryWriterSchema, dailySynthesisReaderSummaryJsonSchema } from "./openai-responses-reader-summary-schema";
import { isRepairableNarrativeError, readerSummaryRepairInstruction } from "./reader-summary-narrative-repair-contract";
import { assertDailyEditorialSynthesis } from "../../domain/services/reader-summary-daily-input-binding";
import { buildOpenAiReaderSummaryInstructions } from "./openai-responses-reader-summary-prompt";
import { dailyEditorialReaderSummaryJsonSchema, openAiReaderSummaryJsonSchema } from "./openai-responses-reader-summary-schema";
import { normalizeDailyEditorialNarrative } from "./openai-responses-reader-summary-editorial-narrative";
import { dailyDigestFixture } from "./reader-summary-daily-digest.fixture";
import { buildReaderSummaryEvidenceCitationMap, readerSummaryCitableEvidence } from "./reader-summary-evidence-citation-map";
import { validateDailyEditorialPlan } from "../../domain";

it("keeps complete detailed paragraphs beyond the previous 720-character ceiling", async () => {
  const { input } = await dailyDigestFixture();
  const frozen = input.evidence.dailyGenerationInput!;
  const source = frozen.selected[0]!;
  const plan = validateDailyEditorialPlan({ version: "reader_summary.daily_editorial.v2",
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
      storyClusterId: null, citationIds: ["c1"], text: value }],
  });
  expect(text.length).toBeGreaterThan(720);
  expect(normalize(text)[0]?.text).toBe(text);
  expect(() => normalize(text.slice(0, 719) + "x")).toThrow("unfinished");
  expect(() => normalize("x".repeat(1600) + ".")).toThrow("too long");
  expect(dailyEditorialReaderSummaryJsonSchema.$defs.narrativeSection.properties.text).toMatchObject({ maxLength: 1600 });
  expect(openAiReaderSummaryJsonSchema.$defs.narrativeSection.properties.text).toMatchObject({ maxLength: 720 });
});

it("synthesizes distinct stories while preserving sparse evidence and rejecting false multi-source support", async () => {
  const { input } = await dailyDigestFixture();
  const frozen = input.evidence.dailyGenerationInput!;
  const distinct = [...new Map(frozen.selected.map(source => [source.storyId, source])).values()].slice(0, 3);
  expect(distinct.length).toBeGreaterThanOrEqual(2);
  const plan = validateDailyEditorialPlan({ version: "reader_summary.daily_editorial.v2", topics: distinct.map((source,index) => ({
    title: `Event ${index}`, why: "A supported development", depth: index===0 ? "detailed" : "brief", feedItemIds:[source.feedItemId],
  })) }, frozen);
  const allowed = buildReaderSummaryEvidenceCitationMap(readerSummaryCitableEvidence(input.evidence))
    .filter(citation => distinct.some(item => item.feedItemId === citation.feedItemId))
    .map(citation => citation.citationId);
  expect(allowed).toHaveLength(distinct.length);
  const instructions = buildOpenAiReaderSummaryInstructions({...input,dailyEditorialPlan:plan});
  expect(instructions).toContain("overall picture");
  expect((readerSummaryWriterSchema({...input,dailyEditorialPlan:plan}) as { $defs:{narrativeSection:{properties:{citationIds:unknown}}}}).$defs.narrativeSection.properties.citationIds).toMatchObject({minItems:2,maxItems:3,items:{enum:allowed}});
  expect(instructions).toContain("not a sequence of post recaps");
  expect(instructions).toContain("not a rewrite of the first event title");
  const citationMap = distinct.map((source,index) => ({citationId:`c${index}`,feedItemId:source.feedItemId,
    sourceItemId:source.sourceItemId,providerKey:source.providerKey,canonicalUrl:"https://example.test/source",field:"bodyPreview" as const}));
  const overview = {kind:"lead",title:"The day's picture",text:"The supplied reports show complementary workflow capabilities with different limitations.",storyClusterId:null,citationIds:["c0","c1"]};
  const theme = {...overview,kind:"secondary_signal",title:"Practical limits",text:"These examples support cautious workflow evaluation rather than general adoption claims."};
  const normalize = (rawSections:unknown) => normalizeDailyEditorialNarrative({input:{...input,dailyEditorialPlan:plan},citationMap,rawSections});
  const sections = normalize([overview,theme]);
  expect(sections).toHaveLength(2);
  expect(() => assertDailyEditorialSynthesis(sections,plan,frozen.selected,citationMap)).not.toThrow();
  expect(() => assertDailyEditorialSynthesis([{...sections[0]!,citationIds:["c0"]}],plan,frozen.selected,citationMap)).toThrow("distinct supported stories");
  expect(() => assertDailyEditorialSynthesis([{...sections[0]!,text:"Broken sentence"}],plan,frozen.selected,citationMap)).toThrow("unfinished");
  expect(normalize([overview])[0]?.storyClusterId).toBeUndefined();
  expect(() => normalize([{...overview,citationIds:["c0"]}])).toThrow("distinct supported stories");
  expect(() => normalize([{...overview,citationIds:["c0","unknown"]}])).toThrow("unplanned");
  expect(() => normalize([{...overview,citationIds:["c0","c0"]}])).toThrow("unplanned");
  expect(() => normalize([{...overview,storyClusterId:distinct[0]!.storyId}])).toThrow("story cluster");
  expect(() => normalize([theme,overview])).toThrow("section order");
  expect(() => normalize([{...overview,text:"An unfinished thought"}])).toThrow("unfinished");
  expect(() => normalize([overview,...Array.from({length:6},()=>theme)])).toThrow("at most five");
  const unrelated = {...citationMap[0]!,citationId:"outside",feedItemId:"not-planned"};
  expect(() => normalizeDailyEditorialNarrative({input:{...input,dailyEditorialPlan:plan},citationMap:[...citationMap,unrelated],rawSections:[{...overview,citationIds:["c0","outside"]}]})).toThrow("unplanned");
});

it("selects a bounded synthesis contract without changing legacy schema or repair", () => {
  expect(readerSummaryWriterSchema({})).toBe(openAiReaderSummaryJsonSchema);
  expect(readerSummaryWriterSchema({dailyEditorialPlan:{version:"reader_summary.daily_editorial.v1"}})).toBe(dailyEditorialReaderSummaryJsonSchema);
  expect(dailyEditorialReaderSummaryJsonSchema.properties.narrativeSections.maxItems).toBe(10);
  expect(readerSummaryWriterSchema({dailyEditorialPlan:{version:"reader_summary.daily_editorial.v2"}})).toBe(dailySynthesisReaderSummaryJsonSchema);
  const repair=readerSummaryRepairInstruction({dailyEditorialPlan:{version:"reader_summary.daily_editorial.v2"}},["narrativeSections:maxItems=6"]);
  expect(repair).toContain("maxItems=6");
  expect(repair).toContain("1–6 entries total");
  expect(repair).not.toContain("exactly one secondary_signal for every");
  expect(readerSummaryRepairInstruction({dailyEditorialPlan:{version:"reader_summary.daily_editorial.v1"}})).toContain("exactly one secondary_signal for every");
  expect(isRepairableNarrativeError(new Error("Daily editorial synthesis requires distinct supported stories"))).toBe(true);
  expect(isRepairableNarrativeError(new Error("provider_effect_unknown"))).toBe(false);
  const legacySchemaRepair=readerSummaryRepairInstruction({dailyEditorialPlan:{version:"reader_summary.daily_editorial.v1"}},["title:maxLength=100"]);
  expect(legacySchemaRepair).toContain("title:maxLength=100");
  expect(legacySchemaRepair).not.toContain("For single_story");
  expect(legacySchemaRepair).not.toContain("one entry per editorial topic");
});
