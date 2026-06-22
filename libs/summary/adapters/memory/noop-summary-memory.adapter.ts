import type {
  BuildSummaryMemoryContextQuery,
  RecordSummaryFeedbackMemoryCommand,
  SummaryMemoryContext,
  SummaryMemoryPort,
  SummaryMemoryWriteResult,
} from '../../ports';

export class NoopSummaryMemoryAdapter implements SummaryMemoryPort {
  async buildContext(query: BuildSummaryMemoryContextQuery): Promise<SummaryMemoryContext> {
    return {
      status: 'disabled',
      diagnostics: {
        mode: 'disabled',
        topicId: query.topicId,
      },
      retrievedAt: query.requestedAt,
    };
  }

  async recordSummaryFeedback(command: RecordSummaryFeedbackMemoryCommand): Promise<SummaryMemoryWriteResult> {
    void command;

    return {
      status: 'disabled',
      diagnostics: { mode: 'disabled' },
    };
  }
}
