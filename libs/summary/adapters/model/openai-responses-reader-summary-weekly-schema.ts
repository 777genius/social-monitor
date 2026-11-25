import {
  assertReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelInput,
} from "../../ports/reader-summary-weekly-model.port";
import { projectOpenAiReaderSummaryWeeklyDocumentSchema } from "./openai-responses-reader-summary-weekly-document-schema";

export const buildOpenAiReaderSummaryWeeklyJsonSchema = (
  input: ReaderSummaryWeeklyModelInput,
) => {
  assertReaderSummaryWeeklyModelInput(input);
  const storyIds = input.stories.map((story) => story.storyId);
  const citationIds = input.citations.map((citation) => citation.citationId);
  const certifiedDates = input.days.map((day) => day.date);

  return projectOpenAiReaderSummaryWeeklyDocumentSchema(input, storyIds, citationIds, certifiedDates);
};

export const buildOpenAiReaderSummaryWeeklyResponseFormat = (
  input: ReaderSummaryWeeklyModelInput,
) => ({
  type: "json_schema",
  name: "reader_summary_weekly_output_v1",
  strict: true,
  schema: buildOpenAiReaderSummaryWeeklyJsonSchema(input),
});
