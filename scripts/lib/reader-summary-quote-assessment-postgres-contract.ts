import { classifyFeedPromotionEligibility } from "../../libs/feed/domain/policies/feed-promotion-eligibility";
import { randomUUID } from "node:crypto";
import type { ReaderValueAssessmentStore } from "../../libs/relevance/application/contracts/reader-value-assessment-store";
import { SourceContentSafetyPolicy } from "../../libs/relevance/domain/source-content-safety";
import { classifyReaderValueSourceKind } from "../../libs/relevance/domain/reader-value/reader-value-source-kind";
import { ConservativeReaderValueInputBuilder } from "../../libs/relevance/infrastructure/reader-value/reader-value-input-builder";
import { readerValueRequestMatches } from "../../libs/relevance/infrastructure/reader-value/reader-value-request-guard";
import type { ReaderSummaryPublicationPostgresClient } from "./reader-summary-publication-postgres-fixture-scope";
import { readerSummaryPublicationFixtureScope } from "./reader-summary-publication-postgres-fixture-scope";
import { assertPostgres as assert } from "./reader-summary-publication-postgres-assertions";
import { sha256 } from "./reader-summary-weekly-publication-evidence-postgres-contract";

/** Native codec/cache proof only: no scorer, SDK, HTTP request or fabricated answer. */
export const assertQuoteAssessmentPostgresContract = async (params: {
  readonly client: ReaderSummaryPublicationPostgresClient;
  readonly store: ReaderValueAssessmentStore;
  readonly interestId: string;
}): Promise<void> => {
  const scope = readerSummaryPublicationFixtureScope;
  const sourceItemId = randomUUID(), bindingId = randomUUID(), catalogId = randomUUID();
  const title = "An authored engineering observation";
  const body = "I measured a smaller test feedback loop after separating the source fetch from the ranking calculation.";
  const canonicalUrl = "https://x.com/fixture/status/1000000000000000001";
  const revision = sha256(`${title}\n${body}`);
  const metadata = { kind: "x_post", contentKind: "quote", likes: 10, reposts: 1 };
  assert(!classifyFeedPromotionEligibility({ providerKey: "x-twitter", providerMetadata: metadata }).eligible,
    "legacy default promotion must still reject quotes");
  assert(!classifyReaderValueSourceKind("x-twitter", { ...metadata, postType: "reply" }).supported,
    "conflicting quote/reply metadata must not forge supported quote inventory");
  const kind = classifyReaderValueSourceKind("x-twitter", metadata);
  assert(kind.supported && kind.kind === "quote_post", "authored quote must have its own supported inventory kind");
  const catalog = (await params.client.query<{ readonly id: string }>(`
    INSERT INTO source_catalog_entries(id,provider_key,display_name,acquisition_mode,readiness,updated_at)
    VALUES($1::uuid,'x-twitter','Synthetic quote source','pull','ready',clock_timestamp())
    ON CONFLICT(provider_key) DO UPDATE SET provider_key=EXCLUDED.provider_key RETURNING id::text`, [catalogId])).rows[0]!;
  await params.client.query(`INSERT INTO source_bindings(id,tenant_id,workspace_id,interest_id,
    source_catalog_entry_id,capability_profile_version,status,config,updated_at)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,1,'ENABLED','{}',clock_timestamp())`,
  [bindingId, scope.tenantId, scope.workspaceId, params.interestId, catalog.id]);
  await params.client.query(`INSERT INTO source_items(id,tenant_id,workspace_id,source_binding_id,provider_key,
    provider_item_id,canonical_url,title,body,published_at,content_hash,observed_at,metadata)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,'x-twitter',$5,$6,$7,$8,clock_timestamp(),$9,clock_timestamp(),$10::jsonb)`,
  [sourceItemId, scope.tenantId, scope.workspaceId, bindingId, `synthetic-quote:${sourceItemId}`,
    canonicalUrl, title, body, revision, JSON.stringify(metadata)]);
  await params.client.query(`INSERT INTO feed_items(id,tenant_id,workspace_id,interest_id,
    source_item_id,source_binding_id,provider_key,dedupe_key,canonical_url,title,body_preview,
    published_at,observed_at,updated_at,provider_metadata)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,'x-twitter',$7,$8,$9,$10,
      clock_timestamp(),clock_timestamp(),clock_timestamp(),$11::jsonb)`,
  [randomUUID(), scope.tenantId, scope.workspaceId, params.interestId, sourceItemId,
    bindingId, `synthetic-quote:${sourceItemId}`, canonicalUrl, title, body, JSON.stringify(metadata)]);
  const interest = (await params.client.query<{ readonly query: string }>(
    "SELECT query FROM interests WHERE id=$1::uuid", [params.interestId])).rows[0]!;
  const prepared = new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy()).prepare({
    ...scope, interestId: params.interestId, sourceItemId, providerKey: "x-twitter",
    canonicalUrl, title, body, interest: interest.query, quotedContext: "not_captured",
    availableAt: "2026-11-02T00:00:00.000000Z", capture: {
      representationVersion: "native-quote-fixture.v1", availability: "complete", segments: [{
        origin: "native", sourceUrl: canonicalUrl, finalUrl: canonicalUrl,
        offset: 0, length: body.length, originalLength: body.length, truncated: false,
      }],
    },
  }, revision);
  assert(prepared.ok, "synthetic authored quote must prepare through the genuine builder");
  if (!prepared.ok) throw new Error("Quote preparation is unavailable");
  assert(prepared.value.terminalFailure === undefined && readerValueRequestMatches(prepared.value, "openrouter-systemone"),
    "quote-only disclosure must retain a genuine normal classifier request binding");
  const stored = await params.store.ensure(randomUUID(), prepared.value);
  assert(stored !== null && stored.state === "pending" && stored.input.snapshot.quotedContext === "not_captured" &&
    stored.input.requestBody === prepared.value.requestBody && stored.input.inputSha256 === prepared.value.inputSha256 &&
    readerValueRequestMatches(stored.input, "openrouter-systemone"),
  "native ensure/read codec must preserve the quote disclosure and request hashes");
  const replay = await params.store.ensure(randomUUID(), prepared.value);
  assert(replay?.id === stored?.id, "unchanged quoted input must remain an exact cache hit without a model call");
  console.log("Reader value quote native PostgreSQL ensure/read/cache contract OK (zero model calls)");
};
