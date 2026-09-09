/** Verify the exact seed parameters without executing SQL. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { seedSuccessorPublicationGitHub, successorGitHubBoardSource, successorGitHubRows, successorGitHubProjection, successorGitHubSupplement } from "./reader-summary-successor-publication-github";
import { sourceItemContentHash, sourceItemProviderContentHash } from "@social-monitor/ingestion/domain";
import { fixtureId } from "./reader-summary-successor-fixture-seed";

async function main() {
  const statements: { sql: string; args: unknown[] }[] = [];
  // Recorder only; no connected client, emulation engine or database result assertions.
  const recorder = { query: async (sql: string, args: unknown[]) => { statements.push({ sql, args }); } };
  await seedSuccessorPublicationGitHub(recorder as unknown as PoolClient);
  const source = statements.filter(s => s.sql.startsWith("insert into source_items "));
  const feed = statements.filter(s => s.sql.startsWith("insert into feed_items "));
  assert.equal(statements.length, 24); assert.equal(source.length, 10); assert.equal(feed.length, 10);
  const rows = successorGitHubRows();
  for (const [index, row] of rows.entries()) {
    assert.equal(source[index]!.args[0], row.item.sourceItemId);
    assert.equal(source[index]!.args[9], sourceItemContentHash(row.source));
    assert.equal(row.item.sourceProviderContentHash, createHash("sha256").update(successorGitHubBoardSource).digest("hex"));
    assert.equal(source[index]!.args[10], sourceItemProviderContentHash({ providerKey: "github-trending-page", snapshot: row.source }));
    assert.deepEqual(JSON.parse(String(source[index]!.args[12])), row.source.metadata);
    assert.equal(feed[index]!.args[0], row.item.feedItemId); assert.equal(feed[index]!.args[4], row.item.sourceItemId);
    assert.equal(feed[index]!.args[5], fixtureId(102));
    assert.equal(feed[index]!.args[11], row.item.observedAt);
  }
  const scan = statements.find(s => s.sql.startsWith("insert into scan_jobs "))!;
  assert.match(scan.sql, /'SUCCEEDED'/);
  const receipt = JSON.parse(String(scan.args[7]));
  assert.equal(receipt.acceptedItemCount, 10); assert.equal(receipt.status, "succeeded");
  assert.equal(receipt.targetPublishedWindowStartedAt, "2026-09-03T00:00:00.000Z");
  assert.equal(receipt.targetPublishedWindowEndedAt, "2026-09-04T00:00:00.000Z");
  const supplement = successorGitHubSupplement(successorGitHubProjection());
  assert.equal(supplement.posts.length, 10); assert.equal(supplement.appendix?.citationIds.length, 3);
  console.log(JSON.stringify({ status: "local-seed-contract-verified", sourceRows: 10, feedRows: 10, databaseInvocations: 0 }));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
