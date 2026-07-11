import {
  canReaderSummaryGenerationSupersede,
  readerSummaryScopeKey,
  type ReaderSummaryArtifact,
} from "../../../domain";
import type { PrismaReaderSummaryClient } from "./prisma-reader-summary-client";
import { readerSummaryPublicationGenerationRequestedAt } from "./prisma-reader-summary-publication-generation";
import type { PrismaSummaryStatus } from "./prisma-summary-records";

const visibleStatuses = ["COMPLETED"] as const;

export const readerSummaryStatusAfterModelAuthorityCheck = async (params: {
  readonly prisma: PrismaReaderSummaryClient;
  readonly proposedStatus: PrismaSummaryStatus;
  readonly snapshot: ReturnType<ReaderSummaryArtifact["toSnapshot"]>;
  readonly generationRequestedAt?: Date;
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
      !canReaderSummaryGenerationSupersede({
        incomingModelVersion: snapshot.lineage.modelVersion,
        visibleModelVersion: peer.modelVersion,
        incomingRequestedAt: params.generationRequestedAt,
        visibleRequestedAt: readerSummaryPublicationGenerationRequestedAt(
          peer.qualitySignals,
        ),
      }),
  );

  return blocked ? "SUPERSEDED" : params.proposedStatus;
};
