import assert from "node:assert/strict";
import { Pool } from "pg";

import { feedCollectionCoverageSql } from "../libs/feed/adapters/persistence/prisma/prisma-feed-collection-coverage";

/** Uses the existing local assessment sandbox identity, never an application DB. */
async function main(): Promise<void> {
  const connectionString = process.env.READER_VALUE_TEST_ADMIN_DATABASE_URL;
  if (!connectionString) throw new Error("READER_VALUE_TEST_ADMIN_DATABASE_URL is required");
  const url = new URL(connectionString);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username !== "assessment_test_admin") {
    throw new Error("Coverage regression refuses non-sandbox database identity");
  }
  const pool = new Pool({ connectionString, min: 0, max: 1 });
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query(`CREATE TEMP TABLE feed_items (
      id uuid, tenant_id uuid, workspace_id uuid, interest_id uuid,
      provider_key text, status text, published_at timestamptz,
      observed_at timestamptz, provider_metadata jsonb) ON COMMIT DROP`);
    await db.query(`INSERT INTO feed_items SELECT md5(i::text)::uuid,
      $1::uuid,$2::uuid,$3::uuid,
      CASE WHEN i%21=0 THEN 'github-trending-page'
        WHEN i=2 THEN ' reddit ' WHEN i=3 THEN U&'\\00A0reddit\\2003' ELSE 'reddit' END,
      'VISIBLE','2026-11-03T12:00Z'::timestamptz+i*interval '1 second',
      '2026-11-04T00:00Z', CASE WHEN i=1 THEN
      '{"normalizedSignal":{"score":10},"muted":true,"rating":{"value":0},
        "topic":" AI ","searchQuery":" agents ","searchQueries":["agents"," tools ",42,""]}'::jsonb
      WHEN i=2 THEN '{"normalizedSignal":{"score":"malicious"},"signal":{"score":{}},
        "rating":{"value":"3"},"searchQueries":{}}'::jsonb
      ELSE '{}'::jsonb END FROM generate_series(1,1280) i`, scope);
    // Every exclusion has otherwise eligible fields, so each predicate matters.
    await db.query(`INSERT INTO feed_items SELECT md5(('excluded'||i)::text)::uuid,
      CASE WHEN i=1 THEN 'aaaaaaaa-1111-4111-8111-111111111111' ELSE $1 END::uuid,
      CASE WHEN i=2 THEN 'aaaaaaaa-2222-4222-8222-222222222222' ELSE $2 END::uuid,
      CASE WHEN i=3 THEN 'aaaaaaaa-3333-4333-8333-333333333333' ELSE $3 END::uuid,
      'rss',CASE WHEN i=4 THEN 'HIDDEN' ELSE 'VISIBLE' END,
      CASE WHEN i=5 THEN '2026-11-02T23:59:59Z' WHEN i=6 THEN '2026-11-04T00:00Z'
        ELSE '2026-11-03T12:00Z' END::timestamptz,
      CASE WHEN i=7 THEN '2026-11-04T12:00:01Z' ELSE '2026-11-04T00:00Z' END::timestamptz,
      '{}'::jsonb FROM generate_series(1,7) i`, scope);
    const { rows } = await db.query(feedCollectionCoverageSql, [...scope,
      "2026-11-03T00:00Z", "2026-11-04T00:00Z", "2026-11-04T12:00Z",
      ["github-trending-page", "github-issues"]]);
    const counts = { collectedFeedItemCount: 1220, lowRelevanceFeedItemCount: 1,
      mutedFeedItemCount: 1, userRatedFeedItemCount: 1 };
    assert.deepEqual(rows.find(row => row.dimension === "total"), {
      dimension: "total", key: "", label: null, ...counts,
    });
    assert.deepEqual(rows.filter(row => row.dimension === "provider"), [{
      dimension: "provider", key: "reddit", label: null, ...counts,
    }]);
    assert.deepEqual(rows.filter(row => row.dimension === "topic"), [{
      dimension: "topic", key: scope[2], label: "AI", ...counts,
    }]);
    assert.deepEqual(rows.filter(row => row.dimension === "query")
      .sort((a, b) => a.key.localeCompare(b.key)), ["agents", "tools"].map(key => ({
      dimension: "query", key, label: null, collectedFeedItemCount: 1,
      lowRelevanceFeedItemCount: 1, mutedFeedItemCount: 1, userRatedFeedItemCount: 1,
    })));
    console.log("Feed collection coverage PostgreSQL regression passed (1220 ordinary / 60 GitHub)");
  } finally {
    await db.query("ROLLBACK");
    db.release();
    await pool.end();
  }
}
const scope = ["11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
