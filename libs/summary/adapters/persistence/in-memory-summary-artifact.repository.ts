import type { SummaryArtifact } from '../../domain';
import type {
  ListSummaryArtifactsQuery,
  ListSummaryArtifactsResult,
  SummaryArtifactRepositoryPort,
} from '../../ports';

export class InMemorySummaryArtifactRepository implements SummaryArtifactRepositoryPort {
  private readonly artifactsById = new Map<string, SummaryArtifact>();

  async save(artifact: SummaryArtifact): Promise<void> {
    const snapshot = artifact.toSnapshot();
    this.artifactsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.summaryId}`, artifact);
  }

  async list(query: ListSummaryArtifactsQuery): Promise<ListSummaryArtifactsResult> {
    const offset = parseCursor(query.cursor);
    const allItems = [...this.artifactsById.values()]
      .filter((artifact) => {
        const snapshot = artifact.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          (query.interestId === undefined || snapshot.interestId === query.interestId)
        );
      })
      .sort(compareSummaryArtifacts);
    const items = allItems.slice(offset, offset + query.limit);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor: nextOffset < allItems.length ? encodeCursor(nextOffset) : undefined,
    };
  }

  async findById(
    params: Parameters<SummaryArtifactRepositoryPort['findById']>[0],
  ): Promise<SummaryArtifact | null> {
    return this.artifactsById.get(`${params.tenantId}:${params.workspaceId}:${params.summaryId}`) ?? null;
  }
}

const compareSummaryArtifacts = (left: SummaryArtifact, right: SummaryArtifact): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const completedWindowDiff =
    rightSnapshot.sourceWindow.endedAt.getTime() - leftSnapshot.sourceWindow.endedAt.getTime();

  if (completedWindowDiff !== 0) {
    return completedWindowDiff;
  }

  return rightSnapshot.summaryId.localeCompare(leftSnapshot.summaryId);
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
