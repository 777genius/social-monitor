import { createHash } from "node:crypto";
import type { ReaderSummaryPublicationCommand } from "../../../ports";
import { readerSummaryWorkspaceManifestSha256,
  type ReaderSummaryWorkspacePreparationManifest } from "../../../domain";
import { canonicalPromotionPayload, promotionPayloadDigest } from
  "../../../domain/services/reader-post-promotion-attestation";
import { readerPostPresentationV3Identity, readerPostPresentationV3InputDigest } from
  "../../../domain/services/reader-post-presentation-v3";
import type { PrismaReaderSummaryClient } from "./prisma-reader-summary-client";
import { readerSummaryV3PublicationGuard } from
  "./prisma-reader-summary-v3-publication-guard";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const cutoff = "2026-09-21T00:00:00.000000Z";
const assessedAt = "2026-09-20T12:00:00.000000Z";
const startedAt = new Date("2026-09-21T00:01:00.000Z");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const config = { schemaVersion: "reader_summary_preparation_config.v1",
  interestId: id(10), interestSha256: digest("first query"),
  rubricVersion: "rubric.v1", rubricSha256: "b".repeat(64),
  inputBuilderVersion: "input.v1", modelConfigVersion: "model.v1" };
const candidate = { candidateId: id(20), assessmentId: id(30),
  sourceItemId: id(21), sourceBindingId: id(22), providerKey: "rss",
  sourceRevisionKey: "candidate-revision", sourceSnapshotSha256: "c".repeat(64),
  inputSha256: "d".repeat(64), sourceKind: "article",
  canonicalIdentity: "https://example.test/item",
  publishedAt: "2026-09-20T11:00:00.000000Z",
  observedAt: "2026-09-20T11:01:00.000000Z" };
const answer = (choice: string, labels: readonly string[]) => ({ choice,
  probabilities: Object.fromEntries(labels.map((label) =>
    [label, label === choice ? 1 : 0])), confidence: 0.9,
  choiceDiffersFromArgmax: false, probabilityTie: false });
const answers = (choice: "noise" | "useful") => ({
  usefulness: answer(choice, ["noise", "context", "useful", "important",
    "insufficient_context"]),
  relevance: answer("central", ["unrelated", "adjacent", "relevant",
    "central", "insufficient_context"]),
  context_sufficiency: answer("sufficient", ["insufficient", "partial",
    "sufficient"]),
  evidence_basis: answer("observation", ["observation", "described_data",
    "linked_claim", "unsupported_claim", "no_claim", "insufficient_context"]),
});

describe("Prisma interest V1 frozen publication guard", () => {
  it("publishes a promoted V1 candidate reused from a content-equivalent revision", async () => {
    const fixture = setup("promoted", "v1");
    await expect(readerSummaryV3PublicationGuard(fixture.client,
      fixture.command)).resolves.toEqual({ allowed: true });
    expect(fixture.sql.some((query) => query.includes("FROM reader_value_assessments a")))
      .toBe(true);
  });

  it("publishes V1 no signal with a frozen noise assessment from another revision", async () => {
    const fixture = setup("no_signal", "v1");
    await expect(readerSummaryV3PublicationGuard(fixture.client,
      fixture.command)).resolves.toEqual({ allowed: true });
  });

  it("rejects a V2 workspace candidate bound to another source revision", async () => {
    const fixture = setup("no_signal", "v2");
    await expect(readerSummaryV3PublicationGuard(fixture.client,
      fixture.command)).resolves.toEqual({ allowed: false,
      reason: "config_unavailable" });
  });
});

const setup = (result: "promoted" | "no_signal", version: "v1" | "v2") => {
  const workspace = version === "v2";
  const manifest = workspace
    ? { schemaVersion: "reader_summary_preparation_manifest.v2", cutoffAt: cutoff,
      periodKey: "daily:test-period", interests: [config],
      candidates: [{ ...candidate, interestId: config.interestId }] }
    : { schemaVersion: "reader_summary_preparation_manifest.v1", cutoffAt: cutoff,
      interestSha256: config.interestSha256, rubricSha256: config.rubricSha256,
      inputBuilderVersion: config.inputBuilderVersion,
      modelConfigVersion: config.modelConfigVersion, candidates: [candidate] };
  const preparationConfig = workspace
    ? { schemaVersion: "reader_summary_preparation_config.v2", interests: [config] }
    : config;
  const promotion = result === "promoted" ? promoted() : undefined;
  const row = { status: "RUNNING", scope_type: workspace ? "workspace" : "interest",
    reader_summary_artifact_id: null, selection_strategy: "jev_primary_v3",
    terminal_failure_code: null, preparation_manifest: manifest,
    preparation_config: preparationConfig,
    preparation_manifest_sha256: workspace
      ? readerSummaryWorkspaceManifestSha256(manifest as
        ReaderSummaryWorkspacePreparationManifest) : null,
    period_key: "daily:test-period", started_at: startedAt,
    preparation_cutoff_at: cutoff,
    preparation_deadline_at: "2026-09-21T00:15:00.000000Z",
    workspace_live: true, tenant_live: true };
  const assessment = { id: candidate.assessmentId, interest_id: config.interestId,
    source_item_id: candidate.sourceItemId,
    source_revision_key: "reused-assessment-revision",
    source_snapshot_sha256: candidate.sourceSnapshotSha256,
    input_sha256: candidate.inputSha256, interest_sha256: config.interestSha256,
    rubric_version: config.rubricVersion, rubric_sha256: config.rubricSha256,
    input_builder_version: config.inputBuilderVersion,
    model_config_version: config.modelConfigVersion, assessed_at: assessedAt,
    result: answers(result === "promoted" ? "useful" : "noise"),
    input_snapshot: { safety: "allowed", title: "Example update",
      body: "Example details", interest: "first query",
      retainedSnapshotTruncated: false, capture: { availability: "available" } } };
  const sql: string[] = [];
  const client = { $queryRaw: async (parts: TemplateStringsArray) => {
    const query = parts.join("?");
    sql.push(query);
    if (query.includes("FROM reader_summary_jobs j")) return [row];
    if (query.includes("FROM interests i")) return [{ id: config.interestId,
      query: "first query" }];
    if (query.includes("FROM feed_items f")) return [{ id: candidate.candidateId,
      interest_id: config.interestId, source_item_id: candidate.sourceItemId,
      source_binding_id: candidate.sourceBindingId,
      provider_key: candidate.providerKey }];
    if (query.includes("FROM reader_value_assessments a")) return [assessment];
    return [];
  } } as unknown as PrismaReaderSummaryClient;
  const command = { finalJob: { toSnapshot: () => ({ id: id(1),
    tenantId: id(2), workspaceId: id(3), status: result === "promoted"
      ? "completed" : "no_signal", startedAt, selectionStrategy: "jev_primary_v3",
    preparationConfig, preparationManifestSha256: row.preparation_manifest_sha256,
    scope: workspace ? { type: "workspace" } : { type: "interest",
      interestId: config.interestId }, period: { periodKey: "daily:test-period",
      startedAt: new Date("2026-09-20T00:00:00.000Z"),
      endedAt: new Date("2026-09-21T00:00:00.000Z") } }) },
  artifact: { toSnapshot: () => ({ readerSummaryId: id(4),
    promotionAttestations: promotion ? [promotion.attestation] : [],
    content: promotion ? { topReads: [promotion.card], selectedPosts: [] } : undefined,
    qualityFlags: result === "no_signal" ? ["no_signal"] : [],
    period: { periodKey: "daily:test-period" },
    sourceWindow: { exactIngestionCutoff: cutoff,
      ingestionCutoff: new Date(cutoff) } }) } } as unknown as ReaderSummaryPublicationCommand;
  return { client, command, sql };
};

const promoted = () => {
  const source = { title: "Example update", body: "Example details",
    captureAvailability: "available", reviewAvailability: "body_present" };
  const context = { tenantId: id(2), workspaceId: id(3),
    interestId: config.interestId, sourceBindingId: candidate.sourceBindingId,
    sourceItemId: candidate.sourceItemId, trustedIntent: "first query",
    availability: "body_present" };
  const headline = { status: "accepted", kind: "claim", text: source.title,
    binding: { ...context, candidateId: candidate.candidateId,
      providerKey: candidate.providerKey,
      reviewedInputDigest: promotionPayloadDigest(JSON.stringify({
        candidateId: candidate.candidateId, providerKey: candidate.providerKey,
        context, title: source.title, body: source.body })) },
    support: [{ field: "title", start: 0, end: source.title.length,
      quote: source.title }], qualifications: [], confidence: 0.95,
    wholeInput: { titleLength: source.title.length, bodyLength: source.body.length,
      qualificationJudgment: "none" } };
  const seal = { headline,
    capturedSourceDigest: promotionPayloadDigest(canonicalPromotionPayload(source)) };
  const inputDigest = readerPostPresentationV3InputDigest({
    tenantId: id(2), workspaceId: id(3), interestId: config.interestId,
    candidateId: candidate.candidateId, sourceItemId: candidate.sourceItemId,
    sourceBindingId: candidate.sourceBindingId, providerKey: candidate.providerKey,
    trustedIntent: "first query", sourceSnapshotSha256: candidate.sourceSnapshotSha256,
    title: source.title, body: source.body, captureComplete: true });
  const attestation = { schemaVersion: "reader_post_promotion_attestation.v3",
    candidateId: candidate.candidateId, exactIngestionCutoff: cutoff,
    ingestionCutoff: new Date(cutoff), publishedAt: candidate.publishedAt,
    assessment: { assessmentId: candidate.assessmentId, assessedAt,
      sourceSnapshotSha256: candidate.sourceSnapshotSha256,
      inputSha256: candidate.inputSha256, rubricVersion: config.rubricVersion,
      rubricSha256: config.rubricSha256,
      modelConfigVersion: config.modelConfigVersion, answers: answers("useful") },
    comparator: { usefulness: "useful", relevance: "central",
      publishedAt: candidate.publishedAt, candidateId: candidate.candidateId },
    presentation: { presentationInputDigest: inputDigest, displayHeadline: seal,
      presentationIdentity: readerPostPresentationV3Identity({
        sourceSnapshotSha256: candidate.sourceSnapshotSha256,
        presentationInputDigest: inputDigest,
        displayHeadline: seal as never }) } };
  const card = { title: source.title, providerKey: candidate.providerKey,
    promotionCandidateId: candidate.candidateId,
    exactPublishedAt: candidate.publishedAt, capturedSource: source,
    displayHeadline: headline };
  return { attestation, card };
};
