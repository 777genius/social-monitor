import type { SummaryFeedback } from '../../domain';
import type {
  ListSummaryFeedbackQuery,
  ListSummaryFeedbackResult,
  SummaryFeedbackRepositoryPort,
} from '../../ports';

export class InMemorySummaryFeedbackRepository implements SummaryFeedbackRepositoryPort {
  private readonly feedbackById = new Map<string, SummaryFeedback>();
  private readonly feedbackByIdempotencyKey = new Map<string, SummaryFeedback>();

  async save(feedback: SummaryFeedback): Promise<void> {
    const snapshot = feedback.toSnapshot();
    this.feedbackById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.id}`, feedback);
    this.feedbackByIdempotencyKey.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.idempotencyKey}`,
      feedback,
    );
  }

  async findByIdempotencyKey(
    query: Parameters<SummaryFeedbackRepositoryPort['findByIdempotencyKey']>[0],
  ): Promise<SummaryFeedback | null> {
    return this.feedbackByIdempotencyKey.get(
      `${query.tenantId}:${query.workspaceId}:${query.idempotencyKey}`,
    ) ?? null;
  }

  async list(query: ListSummaryFeedbackQuery): Promise<ListSummaryFeedbackResult> {
    const offset = parseCursor(query.cursor);
    const allItems = [...this.feedbackById.values()]
      .filter((feedback) => {
        const snapshot = feedback.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          snapshot.summaryId === query.summaryId
        );
      })
      .sort(compareSummaryFeedback);
    const items = allItems.slice(offset, offset + query.limit);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor: nextOffset < allItems.length ? encodeCursor(nextOffset) : undefined,
    };
  }

  all(): readonly SummaryFeedback[] {
    return [...this.feedbackById.values()];
  }
}

const compareSummaryFeedback = (left: SummaryFeedback, right: SummaryFeedback): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const createdAtDiff = rightSnapshot.createdAt.getTime() - leftSnapshot.createdAt.getTime();

  if (createdAtDiff !== 0) {
    return createdAtDiff;
  }

  return rightSnapshot.id.localeCompare(leftSnapshot.id);
};

const encodeCursor = (offset: number): string => Buffer.from(JSON.stringify({ offset })).toString('base64url');

const parseCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };

    if (typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) && parsed.offset >= 0) {
      return parsed.offset;
    }
  } catch {
    return 0;
  }

  return 0;
};
