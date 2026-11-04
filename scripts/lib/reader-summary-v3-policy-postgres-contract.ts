import { randomUUID } from "node:crypto";
import { ReaderSummaryArtifact, type ReaderPostPromotionAttestationV3 } from "../../libs/summary/domain";
import { READER_PROMOTION_POLICY_STAMP, READER_PROMOTION_POLICY_V1,
  type ReaderPromotionRankingContext } from "../../libs/summary/domain/policies/reader-promotion-policy-version";
import { canonicalPromotionPayload, promotionPayloadDigest } from "../../libs/summary/domain/services/reader-post-promotion-attestation";
import type { ReaderSummaryV3PreparationSourcePort } from "../../libs/summary/ports";
import type { ReaderSummaryPublicationPostgresClient } from "./reader-summary-publication-postgres-fixture-scope";
import type { ReaderSummaryPublicationRunningFixture } from "./reader-summary-publication-postgres-running-fixture";
import { assertPostgres as assert, assertPostgresRejects as assertRejects } from "./reader-summary-publication-postgres-assertions";
import { buildV3PolicyFixture } from "./reader-summary-v3-policy-fixture";
import { readPersistedV3FixtureArtifact } from "./reader-summary-v3-artifact-readback";

type Params = {
  readonly client: ReaderSummaryPublicationPostgresClient;
  readonly createFixture: (status: "COMPLETED", day: number, overrides: {
    readonly publicationInterestId: string; readonly providerEvidence: "reddit";
    readonly providerPublishedAt: string; readonly providerObservedAt: string;
    readonly payloadTransform: (source: Readonly<Record<string, unknown>>) =>
      ReturnType<typeof buildV3PolicyFixture>;
  }) => Promise<ReaderSummaryPublicationRunningFixture>;
  readonly advance: (fixture: ReaderSummaryPublicationRunningFixture,
    source: ReaderSummaryV3PreparationSourcePort) => Promise<unknown>;
  readonly publish: (fixture: ReaderSummaryPublicationRunningFixture,
    artifact?: ReaderSummaryArtifact) => Promise<string>;
  readonly assertCounts: (fixture: ReaderSummaryPublicationRunningFixture,
    publications: number, outbox: number) => Promise<void>;
};
const exactCutoff = "2026-06-08T10:00:00.123456Z";
export const assertV3RankingPolicyPostgresContract = async (params: Params): Promise<void> => {
  const create = async (context: ReaderPromotionRankingContext, quote = false, future = false) => {
    let source: ReaderSummaryV3PreparationSourcePort | undefined;
    const fixture = await params.createFixture("COMPLETED", 8, {
      publicationInterestId: randomUUID(), providerEvidence: "reddit",
      providerPublishedAt: "2026-06-08T09:00:00.123456Z",
      providerObservedAt: future ? "2026-06-08T10:01:00.123456Z" : "2026-06-08T09:01:00.123456Z",
      payloadTransform: async payload => {
        const built = await buildV3PolicyFixture(params.client, payload, context, quote);
        source = built.preparationSource;
        return built;
      },
    });
    if (source === undefined) throw new Error("Policy preparation fixture is missing");
    await params.advance(fixture, source);
    return fixture;
  };
  for (const policyVersion of [READER_PROMOTION_POLICY_V1, READER_PROMOTION_POLICY_STAMP]) {
    const fixture = await create(policyVersion === READER_PROMOTION_POLICY_V1
      ? { policyVersion } : { policyVersion, ingestionCutoff: exactCutoff });
    const before = fixture.applicationArtifact!.toSnapshot().promotionAttestations![0]!;
    assert(before.schemaVersion === "reader_post_promotion_attestation.v3" && before.policyVersion === policyVersion,
      "native policy fixture stamp must be explicit");
    if (before.schemaVersion !== "reader_post_promotion_attestation.v3") throw new Error("Missing V3 policy attestation");
    assert(before.comparator.metricMature === (policyVersion === READER_PROMOTION_POLICY_STAMP),
      "one-minute metric eligibility must preserve historical V1 and forward V2 semantics");
    assert(policyVersion === READER_PROMOTION_POLICY_V1 ? before.comparator.popularity === null
      : before.comparator.popularity?.cohortSize === 5 && before.comparator.popularity.below === 4 &&
        before.comparator.popularity.equal === 1,
    "native five-source cohort must bind the actual young metric, not a relabelled V1 score");
    assert(await params.publish(fixture) === "published", `${policyVersion} normal publication must persist`);
    assert(await params.publish(fixture) === "replayed", `${policyVersion} exact publication replay must persist no duplicate`);
    const persisted = await readPersistedV3FixtureArtifact(params.client, fixture.artifactId);
    assert(canonicalPromotionPayload(persisted.toSnapshot().promotionAttestations) ===
      canonicalPromotionPayload(fixture.applicationArtifact!.toSnapshot().promotionAttestations),
    `${policyVersion} native record decoder must preserve the sealed policy and comparator`);
    const diagnostics = persisted.toSnapshot().promotionDiagnostics;
    assert(diagnostics?.candidates.length === 5 && diagnostics.candidates.filter(row =>
      row.presentationValidation?.stage === "headline_seal" &&
      row.presentationValidation.code === "source_reference").length === 4 &&
      canonicalPromotionPayload(diagnostics) ===
        canonicalPromotionPayload(fixture.applicationArtifact!.toSnapshot().promotionDiagnostics),
    `${policyVersion} native JSON persistence/readback must preserve optional closed presentation detail`);
    await params.assertCounts(fixture, 1, 1);
  }
  const quote = await create({ policyVersion: READER_PROMOTION_POLICY_STAMP, ingestionCutoff: exactCutoff }, true);
  const quoteAttestation = quote.applicationArtifact!.toSnapshot().promotionAttestations![0]!;
  assert(quoteAttestation.schemaVersion === "reader_post_promotion_attestation.v3" &&
    quoteAttestation.comparator.engagement?.value === 1000 && quoteAttestation.comparator.metricMature,
  "authored quote must retain genuine own-post metrics through V2");
  assert(await params.publish(quote) === "published", "quote must publish through actual normal transaction");
  const quoteRead = await readPersistedV3FixtureArtifact(params.client, quote.artifactId);
  assert(canonicalPromotionPayload(quoteRead.toSnapshot().promotionAttestations) ===
    canonicalPromotionPayload(quote.applicationArtifact!.toSnapshot().promotionAttestations),
  "quote PostgreSQL readback must preserve exact assessment/request binding and own metrics");
  await params.assertCounts(quote, 1, 1);
  const forgedQuote = await create({ policyVersion: READER_PROMOTION_POLICY_STAMP, ingestionCutoff: exactCutoff }, true);
  await assertRejects(async () => params.publish(forgedQuote,
    alteredPolicyArtifact(forgedQuote.applicationArtifact!, "quote input hash")),
  "quote cannot publish with a resealed input hash absent from its frozen assessment");
  await params.assertCounts(forgedQuote, 0, 0);
  const tamperKinds = ["unknown policy", "v1 maturity relabel", "wrong cohort",
    "future observation", "missing observation", "exact cutoff"] as const;
  for (const kind of tamperKinds) {
    const fixture = await create({ policyVersion: READER_PROMOTION_POLICY_STAMP, ingestionCutoff: exactCutoff });
    await assertRejects(async () => params.publish(fixture,
      alteredPolicyArtifact(fixture.applicationArtifact!, kind)),
    `resealed ${kind} must not cross the normal native publication boundary`);
    await params.assertCounts(fixture, 0, 0);
  }
  const future = await create({ policyVersion: READER_PROMOTION_POLICY_STAMP, ingestionCutoff: exactCutoff }, false, true);
  await assertRejects(async () => params.publish(future,
    alteredPolicyArtifact(future.applicationArtifact!, "later cutoff admits future metric")),
  "resealed later cutoff must not admit a genuinely frozen future observation past the locked job manifest");
  await params.assertCounts(future, 0, 0);
  console.log("Reader summary V1/V2 ranking policy native PostgreSQL contract OK");
};
type Tamper = "unknown policy" | "v1 maturity relabel" | "wrong cohort" |
  "future observation" | "missing observation" | "exact cutoff" | "later cutoff admits future metric" | "quote input hash";
const alteredPolicyArtifact = (artifact: ReaderSummaryArtifact, kind: Tamper): ReaderSummaryArtifact => {
  const snapshot = artifact.toSnapshot();
  const original = snapshot.promotionAttestations![0]!;
  if (original.schemaVersion !== "reader_post_promotion_attestation.v3") throw new Error("Missing V3 tamper source");
  let changed: ReaderPostPromotionAttestationV3 = original;
  let sourceWindow = snapshot.sourceWindow;
  if (kind === "unknown policy") changed = { ...original,
    policyVersion: "reader_promotion.unknown" } as unknown as ReaderPostPromotionAttestationV3;
  if (kind === "v1 maturity relabel") changed = { ...original, policyVersion: READER_PROMOTION_POLICY_V1 };
  if (kind === "wrong cohort") changed = { ...original, comparator: { ...original.comparator,
    popularity: { ...original.comparator.popularity!, cohortSize: 6, below: 5, equal: 1 } } };
  if (kind === "future observation" || kind === "missing observation") changed = { ...original,
    comparator: { ...original.comparator, metricMature: false, popularity: null,
      engagement: kind === "missing observation" ? null : { ...original.comparator.engagement!,
        observedAt: "2026-06-08T10:00:00.123457Z" } } };
  if (kind === "exact cutoff") {
    const cutoff = "2026-06-08T10:00:00.123457Z";
    changed = { ...original, exactIngestionCutoff: cutoff, ingestionCutoff: new Date(cutoff) };
    sourceWindow = { ...sourceWindow, exactIngestionCutoff: cutoff, ingestionCutoff: new Date(cutoff) };
  }
  if (kind === "later cutoff admits future metric") {
    const cutoff = "2026-06-08T10:02:00.123456Z";
    changed = { ...original, exactIngestionCutoff: cutoff, ingestionCutoff: new Date(cutoff),
      comparator: { ...original.comparator, metricMature: true,
        popularity: { cohortSize: 5, below: 4, equal: 1 } } };
    sourceWindow = { ...sourceWindow, exactIngestionCutoff: cutoff, ingestionCutoff: new Date(cutoff) };
  }
  if (kind === "quote input hash") changed = { ...original,
    assessment: { ...original.assessment, inputSha256: "f".repeat(64) } };
  const body = { ...changed } as Record<string, unknown>;
  delete body.canonicalPayload; delete body.digest;
  const canonicalPayload = canonicalPromotionPayload(body);
  const sealed = { ...changed, canonicalPayload, digest: promotionPayloadDigest(canonicalPayload) };
  const signal = changed.comparator.popularity === null ? 0
    : Number(((changed.comparator.popularity.below + changed.comparator.popularity.equal / 2) /
      changed.comparator.popularity.cohortSize * 10).toFixed(3));
  const content = { ...snapshot.content!, topReads: snapshot.content!.topReads.map(card => ({ ...card,
    signalScore: signal, promotionPolicyVersion: sealed.policyVersion })) };
  return ReaderSummaryArtifact.rehydrate({ ...snapshot, sourceWindow, content,
    promotionAttestations: [sealed] });
};
