import {
  canReaderSummaryModelSupersede,
  readerSummaryScopeKey,
  type ReaderSummaryArtifact,
} from "../../../domain";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import type { PrismaSummaryStatus } from "./prisma-summary-records";

const visibleStatuses = ["COMPLETED"] as const;

export const readerSummaryStatusAfterModelAuthorityCheck = async (params: {
  readonly prisma: PrismaSummaryClient;
  readonly proposedStatus: PrismaSummaryStatus;
  readonly snapshot: ReturnType<ReaderSummaryArtifact["toSnapshot"]>;
}): Promise<PrismaSummaryStatus> => {
  if (params.proposedStatus !== "COMPLETED") {
    return params.proposedStatus;
  }
  const snapshot = params.snapshot;
  const visiblePeers = await params.prisma.readerSummaryArtifact.findMany({
    where: {
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      scopeKey: readerSummaryScopeKey(snapshot.scope),
      cadence: snapshot.period.cadence,
      periodStartedAt: snapshot.period.startedAt,
      periodEndedAt: snapshot.period.endedAt,
      periodTimezone: snapshot.period.timezone,
      status: { in: visibleStatuses },
    },
    orderBy: [
      { periodStartedAt: "desc" },
      { createdAt: "desc" },
      { id: "desc" },
    ],
    skip: 0,
    take: 100,
  });
  const blocked = visiblePeers.some(
    (peer) =>
      !canReaderSummaryModelSupersede(
        snapshot.lineage.modelVersion,
        peer.modelVersion,
      ),
  );

  return blocked ? "SUPERSEDED" : params.proposedStatus;
};
