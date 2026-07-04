import {
  readerSummaryScopeKey,
  type ReaderSummaryArtifact,
} from "../../domain";
import type {
  ListReaderSummaryArtifactsQuery,
  ListReaderSummaryArtifactsResult,
  ListReaderSummaryPeriodSummariesResult,
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
              readerSummaryScopeKey(query.scope)) &&
          (query.cadence === undefined ||
            snapshot.period.cadence === query.cadence) &&
          (query.periodStartedAt === undefined ||
            snapshot.period.startedAt.getTime() ===
              query.periodStartedAt.getTime()) &&
          (query.periodStartedFrom === undefined ||
            snapshot.period.startedAt.getTime() >=
              query.periodStartedFrom.getTime()) &&
          (query.periodStartedBefore === undefined ||
            snapshot.period.startedAt.getTime() <
              query.periodStartedBefore.getTime()) &&
          (query.periodEndedAt === undefined ||
            snapshot.period.endedAt.getTime() ===
              query.periodEndedAt.getTime()) &&
          (query.timezone === undefined ||
            snapshot.period.timezone === query.timezone)
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

  async listPeriodSummaries(
    query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryPeriodSummariesResult> {
    const result = await this.list(query);

    return {
      items: result.items.map((artifact) => {
        const snapshot = artifact.toSnapshot();

        return {
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          readerSummaryId: snapshot.readerSummaryId,
          scope: snapshot.scope,
          period: snapshot.period,
          headline: snapshot.headline,
          status: snapshot.qualityFlags.includes("no_signal")
            ? "no_signal"
            : "completed",
          userId: snapshot.userId,
          subscriptionId: snapshot.subscriptionId,
        };
      }),
      nextCursor: result.nextCursor,
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
    rightSnapshot.period.startedAt.getTime() -
    leftSnapshot.period.startedAt.getTime();

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
