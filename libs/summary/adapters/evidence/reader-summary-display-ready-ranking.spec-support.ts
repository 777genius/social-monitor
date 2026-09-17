import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import { acceptedFixtureReaderHeadline } from "../../test-fixtures/accepted-reader-headline";
import { mapRankedItem } from "./relevance-reader-summary-evidence-support";

/** Ranking tests model completed headline assessment explicitly. */
export const withDisplayReadyRanking = (
  items: readonly RankedFeedItemView[],
  scope: Readonly<{ tenantId: string; workspaceId: string }>,
): readonly RankedFeedItemView[] => items.map((item) => {
  const assessed = acceptedFixtureReaderHeadline(mapRankedItem(item), {
    tenantId: scope.tenantId, workspaceId: scope.workspaceId,
  });
  return { ...item, sourceText: assessed.sourceText, readerHeadline: assessed.readerHeadline };
});
