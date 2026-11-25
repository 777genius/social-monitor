import { createHash } from "node:crypto";
import type { RetainedPromotionAuthority } from
  "@social-monitor/feed/domain/value-objects/retained-promotion-authority";
import { retainedPromotionAuthorityProjectionSql, retainedPromotionAuthoritySha256 } from
  "@social-monitor/feed/adapters/persistence/prisma/retained-promotion-authority-projection";
import type { PrismaSummaryClient } from
  "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-client";

export type HistoricalRetainedEngagementAuthority = RetainedPromotionAuthority & {
  readonly bindingsSha256: string;
};

export const captureRetainedEngagementAuthority = async (input: {
  readonly client: Pick<PrismaSummaryClient, "$queryRaw">;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly boundThrough: Date;
}): Promise<HistoricalRetainedEngagementAuthority> => {
  // Prisma's tagged-query contract keeps scope/window values parameterized.
  const pieces = [
    `SELECT ${retainedPromotionAuthorityProjectionSql} AS projection
       FROM feed_items feed WHERE feed.tenant_id = `,
    `::uuid AND feed.workspace_id = `,
    `::uuid AND feed.status = 'VISIBLE' AND feed.published_at >= `,
    ` AND feed.published_at < `,
    ` ORDER BY feed.id ASC`,
  ];
  const query = Object.assign(pieces, { raw: [...pieces] });
  const rows = await input.client.$queryRaw<readonly { projection: string }[]>(
    query, input.tenantId, input.workspaceId, input.startedAt, input.endedAt,
  );
  const bindings = rows.map(({ projection }) => {
    const row = JSON.parse(projection) as {
      feedItemId: string; snapshot: { last_observed_at: string } | null;
    };
    const observed = row.snapshot === null ? NaN : Date.parse(row.snapshot.last_observed_at);
    return { feedItemId: row.feedItemId,
      authoritySha256: retainedPromotionAuthoritySha256(projection),
      cutoffAt: Number.isFinite(observed) ? row.snapshot!.last_observed_at : null };
  });
  return { mode: "retained-current-authority",
    projection: "feed-engagement-snapshot-and-last-two-observations-v1",
    boundThrough: input.boundThrough.toISOString(), bindings,
    bindingsSha256: bindingsDigest(bindings) };
};

export const assertRetainedEngagementAuthority = (
  value: HistoricalRetainedEngagementAuthority,
): void => {
  if (value.mode !== "retained-current-authority" ||
      value.projection !== "feed-engagement-snapshot-and-last-two-observations-v1" ||
      !canonicalTimestamp(value.boundThrough) || !Array.isArray(value.bindings) ||
      value.bindings.some((binding, index) =>
        typeof binding.feedItemId !== "string" ||
        !/^[0-9a-f]{64}$/u.test(binding.authoritySha256) ||
        (binding.cutoffAt !== null && !canonicalTimestamp(binding.cutoffAt)) ||
        (index > 0 && value.bindings[index - 1]!.feedItemId >= binding.feedItemId)) ||
      value.bindingsSha256 !== bindingsDigest(value.bindings)) {
    throw new Error("Historical retained engagement authority contract is invalid");
  }
};

const bindingsDigest = (bindings: RetainedPromotionAuthority["bindings"]): string =>
  createHash("sha256").update(JSON.stringify(bindings)).digest("hex");
const canonicalTimestamp = (value: string): boolean => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:\d{3})?Z$/u.test(value) &&
    new Date(parsed).toISOString() === value.replace(/(\.\d{3})\d{3}Z$/u, "$1Z");
};
