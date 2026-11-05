import type { ReadPromotionFeedItemSnapshotQuery } from "../../../ports";
import type { PrismaFeedClient } from "./prisma-feed-client";
import type { PrismaFeedItemRecord } from "./prisma-feed-records";

export type PromotionKeysetRow = {
  readonly id: string;
  readonly cursorTimestamp: string;
};

export type PromotionKeysetCursor = {
  readonly id: string;
  readonly timestamp: string;
};

export const readPromotionKeysetPage = async (
  transaction: PrismaFeedClient,
  query: ReadPromotionFeedItemSnapshotQuery,
  after: PromotionKeysetCursor | undefined,
  take: number,
): Promise<readonly PromotionKeysetRow[]> => {
  const timestampColumn = query.timestampPolicy === "published_at"
    ? 'feed."published_at"'
    : 'feed."observed_at"';
  const observedCutoff = query.timestampPolicy === "observed_at"
    ? "AND feed.\"observed_at\" <= $6::timestamptz"
    : "AND $6::timestamptz IS NOT NULL";
  const interestFilter = query.interestId === undefined
    ? "AND $3::uuid IS NULL"
    : "AND feed.\"interest_id\" = $3::uuid";
  const rows = await transaction.$queryRawUnsafe!<readonly PromotionKeysetRow[]>(
    `SELECT feed."id"::text AS "id",
            to_char(${timestampColumn} AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorTimestamp"
       FROM "public"."feed_items" AS feed
      WHERE feed."tenant_id" = $1::uuid
        AND feed."workspace_id" = $2::uuid
        AND feed."status" = 'VISIBLE'::"FeedItemStatus"
        ${interestFilter}
        AND ${timestampColumn} >= $4::timestamptz
        AND ${timestampColumn} < $5::timestamptz
        ${observedCutoff}
        AND ($7::timestamptz IS NULL OR
          (${timestampColumn}, feed."id") < ($7::timestamptz, $8::uuid))
      ORDER BY ${timestampColumn} DESC, feed."id" DESC
      LIMIT $9`,
    query.tenantId,
    query.workspaceId,
    query.interestId ?? null,
    query.windowStartedAt,
    query.windowEndedAt,
    query.observedThrough,
    after?.timestamp ?? null,
    after?.id ?? null,
    take,
  );
  if (rows.some((row) =>
    typeof row.id !== "string" || typeof row.cursorTimestamp !== "string")) {
    throw new Error("Promotion snapshot keyset row is malformed");
  }
  return rows;
};

export const hydratePromotionPage = async (
  transaction: PrismaFeedClient,
  query: ReadPromotionFeedItemSnapshotQuery,
  page: readonly PromotionKeysetRow[],
): Promise<readonly PrismaFeedItemRecord[]> => {
  if (page.length === 0) return [];
  const ids = page.map((row) => row.id);
  const records = await transaction.feedItem.findMany({
    where: {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      status: "VISIBLE",
      id: { in: ids },
    },
    take: ids.length,
  });
  const byId = new Map(records.map((record) => [record.id, record] as const));
  return ids.map((id) => {
    const record = byId.get(id);
    if (record === undefined) {
      throw new Error("Promotion snapshot keyset row could not be hydrated");
    }
    return record;
  });
};
