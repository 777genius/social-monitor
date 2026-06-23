import { briefingScopeKey, type BriefingArtifact } from '../../domain';
import type {
  BriefingArtifactRepositoryPort,
  ListBriefingArtifactsQuery,
  ListBriefingArtifactsResult,
} from '../../ports';

export class InMemoryBriefingArtifactRepository implements BriefingArtifactRepositoryPort {
  private readonly artifactsById = new Map<string, BriefingArtifact>();

  async save(artifact: BriefingArtifact): Promise<void> {
    const snapshot = artifact.toSnapshot();
    this.artifactsById.set(`${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.briefingId}`, artifact);
  }

  async list(query: ListBriefingArtifactsQuery): Promise<ListBriefingArtifactsResult> {
    const offset = parseCursor(query.cursor);
    const allItems = [...this.artifactsById.values()]
      .filter((artifact) => {
        const snapshot = artifact.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          (query.scope === undefined || briefingScopeKey(snapshot.scope) === briefingScopeKey(query.scope))
        );
      })
      .sort(compareBriefingArtifacts);
    const items = allItems.slice(offset, offset + query.limit);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor: nextOffset < allItems.length ? encodeCursor(nextOffset) : undefined,
    };
  }

  async findById(
    params: Parameters<BriefingArtifactRepositoryPort['findById']>[0],
  ): Promise<BriefingArtifact | null> {
    return this.artifactsById.get(`${params.tenantId}:${params.workspaceId}:${params.briefingId}`) ?? null;
  }

  all(): readonly BriefingArtifact[] {
    return [...this.artifactsById.values()];
  }
}

const compareBriefingArtifacts = (left: BriefingArtifact, right: BriefingArtifact): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const completedWindowDiff =
    rightSnapshot.sourceWindow.endedAt.getTime() - leftSnapshot.sourceWindow.endedAt.getTime();

  if (completedWindowDiff !== 0) {
    return completedWindowDiff;
  }

  return rightSnapshot.briefingId.localeCompare(leftSnapshot.briefingId);
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
