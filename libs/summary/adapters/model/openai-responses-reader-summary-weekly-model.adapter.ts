import {
  type OpenAiReaderSummaryWeeklyModelFailure,
} from "./openai-responses-reader-summary-weekly-response-contract";
import { classifyOpenAiReaderSummaryWeeklyError } from "./openai-responses-reader-summary-weekly-failure-policy";
import { executeOpenAiReaderSummaryWeeklyGeneration } from "./openai-responses-reader-summary-weekly-generation";

export {
  OpenAiReaderSummaryWeeklyModelError,
  type OpenAiReaderSummaryWeeklyModelFailure,
  type OpenAiReaderSummaryWeeklyModelFailureKind,
} from "./openai-responses-reader-summary-weekly-response-contract";

import {
  type ReaderSummaryWeeklyModelInput,
  type ReaderSummaryWeeklyModelOutput,
  type ReaderSummaryWeeklyModelPort,
} from "../../ports/reader-summary-weekly-model.port";
import { normalizeOpenAiReaderSummaryWeeklyOptions, type NormalizedOpenAiReaderSummaryWeeklyOptions, type OpenAiResponsesReaderSummaryWeeklyModelAdapterOptions } from "./openai-responses-reader-summary-weekly-options";
export { resolveOpenAiResponsesReaderSummaryWeeklyModelOptions } from "./openai-responses-reader-summary-weekly-options";
export type { OpenAiResponsesReaderSummaryWeeklyModelAdapterOptions } from "./openai-responses-reader-summary-weekly-options";

export class OpenAiResponsesReaderSummaryWeeklyModelAdapter
implements ReaderSummaryWeeklyModelPort {
  private readonly settings: NormalizedOpenAiReaderSummaryWeeklyOptions;

  constructor(
    options: OpenAiResponsesReaderSummaryWeeklyModelAdapterOptions = {},
  ) {
    this.settings = normalizeOpenAiReaderSummaryWeeklyOptions(options);
  }

  async generate(
    input: ReaderSummaryWeeklyModelInput,
  ): Promise<ReaderSummaryWeeklyModelOutput> {
    return executeOpenAiReaderSummaryWeeklyGeneration(input, this.settings);
  }

  classifyError(error: unknown): OpenAiReaderSummaryWeeklyModelFailure {
    return classifyOpenAiReaderSummaryWeeklyError(error);
  }


}

