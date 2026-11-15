import type { SummaryEvidenceSelection } from "../../domain";
import {
  dailyEditorialReaderSummaryJsonSchema,
  dailySynthesisReaderSummaryJsonSchema,
  openAiReaderSummaryJsonSchema,
  readerSummaryWriterSchema,
} from "./openai-responses-reader-summary-schema";
import { openAiReaderSummaryJsonSchema as baseSchema } from "./openai-responses-reader-summary-base-schema";
import { constrainDailySynthesisCitations } from "./openai-responses-reader-summary-daily-synthesis-citation-policy";
import {
  dailyEditorialReaderSummaryJsonSchema as editorialSchema,
  dailySynthesisReaderSummaryJsonSchema as synthesisSchema,
  readerSummaryWriterSchema as selectWriterSchema,
} from "./openai-responses-reader-summary-daily-writer-schema";

describe("OpenAI reader summary daily writer schema boundary", () => {
  it("preserves the historical public exports by object identity", () => {
    expect(openAiReaderSummaryJsonSchema).toBe(baseSchema);
    expect(dailyEditorialReaderSummaryJsonSchema).toBe(editorialSchema);
    expect(dailySynthesisReaderSummaryJsonSchema).toBe(synthesisSchema);
    expect(readerSummaryWriterSchema).toBe(selectWriterSchema);
  });

  it("selects the same base, legacy and v2 contracts without evidence", () => {
    expect(readerSummaryWriterSchema({})).toBe(baseSchema);
    expect(readerSummaryWriterSchema({
      dailyEditorialPlan: { version: "reader_summary.daily_editorial.v1" },
    })).toBe(editorialSchema);
    expect(readerSummaryWriterSchema({
      dailyEditorialPlan: { version: "reader_summary.daily_editorial.v2" },
    })).toBe(synthesisSchema);

    expect(editorialSchema.properties.executiveSummary.maxLength).toBe(5_000);
    expect(editorialSchema.$defs.narrativeSection.properties.text.maxLength).toBe(1_600);
    expect(synthesisSchema.properties.narrativeSections).toMatchObject({
      minItems: 1,
      maxItems: 6,
    });
    expect(synthesisSchema.$defs.narrativeSection.properties).toMatchObject({
      kind: { enum: ["lead", "secondary_signal"] },
      storyClusterId: { type: "null" },
      citationIds: { minItems: 1 },
    });
    expect(baseSchema.properties.executiveSummary.maxLength).toBe(1_800);
  });

  it("restricts v2 writer citations to explicitly assigned evidence", () => {
    const evidence = {
      selectedEvidence: [
        {
          feedItemId: "feed-assigned",
          sourceItemId: "source-assigned",
          providerKey: "reddit",
          canonicalUrl: "https://example.test/assigned",
        },
        {
          feedItemId: "feed-unassigned",
          sourceItemId: "source-unassigned",
          providerKey: "rss",
          canonicalUrl: "",
        },
      ],
    } as unknown as SummaryEvidenceSelection;
    const selected = readerSummaryWriterSchema({
      dailyEditorialPlan: {
        version: "reader_summary.daily_editorial.v2",
        topics: [{ feedItemIds: ["feed-assigned"] }],
      },
      evidence,
    });

    expect(selected).toMatchObject({
      $defs: {
        narrativeSection: {
          properties: {
            citationIds: {
              minItems: 1,
              maxItems: 3,
              items: { enum: ["c1"] },
            },
          },
        },
      },
    });
    expect(synthesisSchema.$defs.narrativeSection.properties.citationIds.items)
      .not.toHaveProperty("enum");
  });

  it("keeps unassigned or missing evidence fail closed for v2", () => {
    const evidence = {
      selectedEvidence: [{
        feedItemId: "feed-outside",
        sourceItemId: "source-outside",
        providerKey: "rss",
        canonicalUrl: "",
      }],
    } as unknown as SummaryEvidenceSelection;
    const selected = readerSummaryWriterSchema({
      dailyEditorialPlan: {
        version: "reader_summary.daily_editorial.v2",
        topics: [{ feedItemIds: ["feed-unknown"] }],
      },
      evidence,
    });

    expect(selected).toMatchObject({
      $defs: {
        narrativeSection: {
          properties: {
            citationIds: { items: { enum: [] }, minItems: 1 },
          },
        },
      },
    });
    expect(readerSummaryWriterSchema({
      dailyEditorialPlan: { version: "reader_summary.daily_editorial.v2" },
    })).toBe(synthesisSchema);
  });
  it("keeps the static v2 schema immutable when there is no evidence to bind", () => {
    const plan = { version: "reader_summary.daily_editorial.v2", topics: [{ feedItemIds: ["missing"] }] };
    const schema = constrainDailySynthesisCitations(
      { dailyEditorialPlan: plan }, synthesisSchema,
    );
    expect(schema).toBe(synthesisSchema);
    expect(readerSummaryWriterSchema({ dailyEditorialPlan: plan })).toBe(synthesisSchema);
    expect(synthesisSchema.$defs.narrativeSection.properties.citationIds.items)
      .not.toHaveProperty("enum");
  });

  it("binds only assigned citations and demands two citations for distinct selected stories", () => {
    const evidence = Object.freeze({
      selectedEvidence: Object.freeze([
        Object.freeze({ feedItemId: "feed-one", sourceItemId: "source-one", providerKey: "reddit", canonicalUrl: "" }),
        Object.freeze({ feedItemId: "feed-two", sourceItemId: "source-two", providerKey: "rss", canonicalUrl: "" }),
        Object.freeze({ feedItemId: "feed-outside", sourceItemId: "source-outside", providerKey: "rss", canonicalUrl: "" }),
      ]),
      dailyGenerationInput: Object.freeze({
        policyVersion: "reader_summary.daily_input.native_likes.v1",
        manifestSha256: "a".repeat(64),
        periodKey: "2026-11-15",
        cutoffAt: "2026-11-15T00:00:00.000Z",
        candidateCount: 2,
        selected: Object.freeze([
          Object.freeze({
            feedItemId: "feed-one", sourceItemId: "source-one", interestId: "interest-one",
            publishedAt: "2026-11-14T20:00:00.000Z", observedAt: "2026-11-15T00:00:00.000Z",
            assessmentId: "assessment-one", sourceSnapshotSha256: "b".repeat(64),
            inputSha256: "c".repeat(64), storyId: "story-one", providerKey: "reddit",
            nativeCount: 3, engagementObservedAt: null,
          }),
          Object.freeze({
            feedItemId: "feed-two", sourceItemId: "source-two", interestId: "interest-two",
            publishedAt: "2026-11-14T21:00:00.000Z", observedAt: "2026-11-15T00:00:00.000Z",
            assessmentId: "assessment-two", sourceSnapshotSha256: "d".repeat(64),
            inputSha256: "e".repeat(64), storyId: "story-two", providerKey: "rss",
            nativeCount: 2, engagementObservedAt: null,
          }),
        ]),
        excluded: Object.freeze([]),
      }),
    }) as unknown as SummaryEvidenceSelection;
    const dailyEditorialPlan = {
      version: "reader_summary.daily_editorial.v2",
      topics: [{ feedItemIds: ["feed-one", "feed-two"] }],
    };
    const input = { dailyEditorialPlan, evidence };
    const selected = constrainDailySynthesisCitations(input, synthesisSchema);
    expect(readerSummaryWriterSchema(input)).toEqual(selected);
    expect(selected.$defs.narrativeSection.properties.citationIds).toMatchObject({
      minItems: 2,
      maxItems: 3,
      items: { enum: ["c1", "c2"] },
    });
    expect(synthesisSchema.$defs.narrativeSection.properties.citationIds.items)
      .not.toHaveProperty("enum");
    expect(evidence.selectedEvidence).toHaveLength(3);
    expect(dailyEditorialPlan.topics).toEqual([{ feedItemIds: ["feed-one", "feed-two"] }]);
  });

});
