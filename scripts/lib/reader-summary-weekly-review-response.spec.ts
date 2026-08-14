import {
  parseReaderSummaryWeeklyReviewResponse,
  readerSummaryWeeklyReviewResponseJsonSchema,
} from "./reader-summary-weekly-review-response";

const story = `story:${"a".repeat(64)}`;
const firstCitation = `citation:${"b".repeat(64)}`;
const secondCitation = `citation:${"c".repeat(64)}`;

describe("reader summary weekly review response", () => {
  it("accepts only review labels and sealed selectors", () => {
    const selections = parseReaderSummaryWeeklyReviewResponse({
      schemaVersion: "reader_summary.weekly_review_response.v1",
      selections: [{
        story,
        label: "evolution",
        citationSelectors: [firstCitation, secondCitation],
        beforeCitationSelector: firstCitation,
        afterCitationSelector: secondCitation,
      }],
    });

    expect(selections).toEqual([{
      story,
      label: "evolution",
      citationSelectors: [firstCitation, secondCitation],
      beforeCitationSelector: firstCitation,
      afterCitationSelector: secondCitation,
    }]);
    expect(readerSummaryWeeklyReviewResponseJsonSchema).toMatchObject({
      additionalProperties: false,
      required: ["schemaVersion", "selections"],
    });
  });

  it("normalizes the exact seal-bound observation findings envelope", () => {
    const sealId = `reader_summary.weekly_certification_seal.v1:${"d".repeat(64)}`;
    expect(parseReaderSummaryWeeklyReviewResponse({
      responseSchemaVersion: "reader_summary.weekly_review_response.v1",
      sealId,
      findings: [{
        type: "observation",
        story,
        selector: firstCitation,
      }],
    }, sealId)).toEqual([{
      story,
      label: "observation",
      citationSelectors: [firstCitation],
    }]);
  });

  it("normalizes the exact compact observation selection", () => {
    expect(parseReaderSummaryWeeklyReviewResponse({
      schemaVersion: "reader_summary.weekly_review_response.v1",
      selections: [{ story, observation: firstCitation }],
    })).toEqual([{
      story,
      label: "observation",
      citationSelectors: [firstCitation],
    }]);
    expect(() => parseReaderSummaryWeeklyReviewResponse({
      schemaVersion: "reader_summary.weekly_review_response.v1",
      selections: [{
        story,
        observation: firstCitation,
        prose: "not admitted",
      }],
    })).toThrow();
  });

  it("rejects observation findings for another seal or with extra fields", () => {
    const sealId = `reader_summary.weekly_certification_seal.v1:${"d".repeat(64)}`;
    expect(() => parseReaderSummaryWeeklyReviewResponse({
      responseSchemaVersion: "reader_summary.weekly_review_response.v1",
      sealId,
      findings: [{ type: "observation", story, selector: firstCitation }],
    }, `reader_summary.weekly_certification_seal.v1:${"e".repeat(64)}`)).toThrow();
    expect(() => parseReaderSummaryWeeklyReviewResponse({
      responseSchemaVersion: "reader_summary.weekly_review_response.v1",
      sealId,
      findings: [{
        type: "observation",
        story,
        selector: firstCitation,
        prose: "not admitted",
      }],
    }, sealId)).toThrow();
  });

  it.each([
    {
      name: "invented prose",
      response: { story, label: "observation", citationSelectors: [firstCitation], prose: "new fact" },
    },
    {
      name: "story identity",
      response: { story, label: "observation", citationSelectors: [firstCitation], storyId: "invented" },
    },
    {
      name: "missing evolution endpoint",
      response: { story, label: "evolution", citationSelectors: [firstCitation] },
    },
  ])("rejects $name", ({ response }) => {
    expect(() => parseReaderSummaryWeeklyReviewResponse({
      schemaVersion: "reader_summary.weekly_review_response.v1",
      selections: [response],
    })).toThrow();
  });
});
