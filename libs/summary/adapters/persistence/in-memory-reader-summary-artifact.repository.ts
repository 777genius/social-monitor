import {
  readerSummaryScopeKey,
  type ReaderSummaryArtifact,
} from "../../domain";
import type {
  ListReaderSummaryArtifactsQuery,
  ListReaderSummaryArtifactsResult,
  ReaderSummaryArtifactRepositoryPort,
} from "../../ports";

export class InMemoryReaderSummaryArtifactRepository implements ReaderSummaryArtifactRepositoryPort {
  private readonly artifactsById = new Map<string, ReaderSummaryArtifact>();

  async save(artifact: ReaderSummaryArtifact): Promise<void> {
    const snapshot = artifact.toSnapshot();
    this.artifactsById.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.readerSummaryId}`,
      artifact,
    );
  }

  async list(
    query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryArtifactsResult> {
    const offset = parseCursor(query.cursor);
    const allItems = [...this.artifactsById.values()]
      .filter((artifact) => {
        const snapshot = artifact.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          (query.scope === undefined ||
            readerSummaryScopeKey(snapshot.scope) ===
              readerSummaryScopeKey(query.scope))
        );
      })
      .sort(compareReaderSummaryArtifacts);
    const items = allItems.slice(offset, offset + query.limit);
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor:
        nextOffset < allItems.length ? encodeCursor(nextOffset) : undefined,
    };
  }

  async findById(
    params: Parameters<ReaderSummaryArtifactRepositoryPort["findById"]>[0],
  ): Promise<ReaderSummaryArtifact | null> {
    return (
      this.artifactsById.get(
        `${params.tenantId}:${params.workspaceId}:${params.readerSummaryId}`,
      ) ?? null
    );
  }

  all(): readonly ReaderSummaryArtifact[] {
    return [...this.artifactsById.values()];
  }
}

const compareReaderSummaryArtifacts = (
  left: ReaderSummaryArtifact,
  right: ReaderSummaryArtifact,
): number => {
  const leftSnapshot = left.toSnapshot();
  const rightSnapshot = right.toSnapshot();
  const completedWindowDiff =
    rightSnapshot.sourceWindow.endedAt.getTime() -
    leftSnapshot.sourceWindow.endedAt.getTime();

  if (completedWindowDiff !== 0) {
    return completedWindowDiff;
  }

  return rightSnapshot.readerSummaryId.localeCompare(
    leftSnapshot.readerSummaryId,
  );
};

const encodeCursor = (offset: number): string =>
  Buffer.from(JSON.stringify({ offset })).toString("base64url");

const parseCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as { offset?: unknown };

    if (
      typeof parsed.offset === "number" &&
      Number.isInteger(parsed.offset) &&
      parsed.offset >= 0
    ) {
      return parsed.offset;
    }
  } catch {
    return 0;
  }

  return 0;
};
