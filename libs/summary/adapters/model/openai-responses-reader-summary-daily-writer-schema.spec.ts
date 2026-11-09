import type { SummaryEvidenceSelection } from "../../domain";
import {
  dailyEditorialReaderSummaryJsonSchema,
  dailySynthesisReaderSummaryJsonSchema,
  openAiReaderSummaryJsonSchema,
  readerSummaryWriterSchema,
} from "./openai-responses-reader-summary-schema";
import { openAiReaderSummaryJsonSchema as baseSchema } from "./openai-responses-reader-summary-base-schema";
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
});
