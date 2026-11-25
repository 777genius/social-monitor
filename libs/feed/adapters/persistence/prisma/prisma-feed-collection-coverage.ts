import type {
  FeedCollectionCoverageQuery,
  FeedCollectionCoverageRow,
} from "../../../ports";
import type { PrismaFeedClient } from "./prisma-feed-client";

/** Only aggregate rows leave PostgreSQL; no bounded ranking scan or post bodies. */
export const readPrismaFeedCollectionCoverage = async (
  prisma: PrismaFeedClient,
  query: FeedCollectionCoverageQuery,
): Promise<readonly FeedCollectionCoverageRow[]> => {
  if (prisma.$queryRawUnsafe === undefined) {
    throw new Error("Complete feed collection coverage requires database aggregates");
  }
  const rows = await prisma.$queryRawUnsafe<readonly (Omit<FeedCollectionCoverageRow, "label"> & { label: string | null })[]>(
    feedCollectionCoverageSql,
    query.tenantId, query.workspaceId, query.interestId ?? null,
    query.publishedAtOrAfter, query.publishedBefore,
    query.observedAtOrBefore ?? null, [...query.excludedProviderKeys],
  );
  return rows.map(({ label, ...row }) => ({
    ...row, ...(label === null ? {} : { label }),
  }));
};

const path = (parts: string): string => `provider_metadata #> '{${parts}}'`;
// CASE, rather than AND, keeps malformed provider JSON away from numeric casts.
const finiteNumber = (parts: string): string =>
  `(CASE WHEN jsonb_typeof(${path(parts)}) = 'number' THEN
    CASE WHEN (${path(parts)})::text::numeric BETWEEN
      -1.7976931348623157e308 AND 1.7976931348623157e308
    THEN (${path(parts)})::text::numeric END END)`;
const truth = (parts: string): string => `(${path(parts)} = 'true'::jsonb)`;
// ECMAScript String.trim whitespace, including non-ASCII provider labels.
const string = (parts: string): string =>
  `CASE WHEN jsonb_typeof(${path(parts)}) = 'string' THEN
    nullif(btrim(provider_metadata #>> '{${parts}}',
      U&' \\0009\\000A\\000B\\000C\\000D\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF'), '') END`;
const firstString = (...parts: string[]): string =>
  `coalesce(${parts.map(string).join(",")})`;
const array = (parts: string): string =>
  `CASE WHEN jsonb_typeof(${path(parts)}) = 'array' THEN ${path(parts)} ELSE '[]'::jsonb END`;
const sums = `count(*)::integer AS "collectedFeedItemCount",
  count(*) FILTER (WHERE low)::integer AS "lowRelevanceFeedItemCount",
  count(*) FILTER (WHERE muted)::integer AS "mutedFeedItemCount",
  count(*) FILTER (WHERE rated)::integer AS "userRatedFeedItemCount"`;

export const feedCollectionCoverageSql = `
WITH scoped AS MATERIALIZED (
  SELECT id, provider_key, interest_id, provider_metadata, published_at
  FROM feed_items
  WHERE tenant_id = $1::uuid AND workspace_id = $2::uuid AND status = 'VISIBLE'
    AND ($3::uuid IS NULL OR interest_id = $3::uuid)
    AND published_at >= $4::timestamptz AND published_at < $5::timestamptz
    AND ($6::timestamptz IS NULL OR observed_at <= $6::timestamptz)
    AND NOT (lower(provider_key) = ANY($7::text[]))
), facts AS MATERIALIZED (
  SELECT id, provider_key, interest_id, published_at,
    (${["normalizedSignal,score", "signal,score", "relevance,score"].map((p) => `${finiteNumber(p)} < 20`).join(" OR ")}) AS low,
    (${["muted", "relevance,muted", "ranking,muted"].map(truth).join(" OR ")}
      OR ${firstString("muteReason", "relevance,muteReason")} IS NOT NULL) AS muted,
    (${["userRated", "rating,userRated"].map(truth).join(" OR ")}
      OR ${finiteNumber("userRating")} IS NOT NULL
      OR ${finiteNumber("rating,value")} IS NOT NULL) AS rated,
    ${firstString("interestQuerySnapshot,query", "interestQuery,query", "topic")} AS label,
    ARRAY(SELECT DISTINCT btrim(q #>> '{}',
      U&' \\0009\\000A\\000B\\000C\\000D\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF')
      FROM jsonb_array_elements(
        jsonb_build_array(${firstString("searchQuery", "query")},
          ${string("sourceBindingSnapshot,sourceQuery,query")})
        || ${array("searchQueries")} || ${array("queries")} || ${array("collection,searchQueries")}
      ) AS q WHERE jsonb_typeof(q) = 'string') AS queries
  FROM scoped
)
SELECT 'total' AS dimension, '' AS key, NULL::text AS label, ${sums} FROM facts
UNION ALL
SELECT 'provider', btrim(provider_key, U&' \\0009\\000A\\000B\\000C\\000D\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF'), NULL::text, ${sums} FROM facts
  WHERE btrim(provider_key, U&' \\0009\\000A\\000B\\000C\\000D\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF') <> '' GROUP BY btrim(provider_key, U&' \\0009\\000A\\000B\\000C\\000D\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF')
UNION ALL
SELECT 'topic', interest_id::text,
  (array_agg(label ORDER BY published_at DESC, id DESC) FILTER (WHERE label IS NOT NULL))[1],
  ${sums} FROM facts GROUP BY interest_id
UNION ALL
SELECT 'query', query_text, NULL::text, ${sums}
  FROM facts CROSS JOIN LATERAL unnest(queries) AS query_text
  WHERE query_text <> '' GROUP BY query_text
`;
