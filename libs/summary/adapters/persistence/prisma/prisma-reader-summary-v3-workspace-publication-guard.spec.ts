import { createHash } from "node:crypto";
import { readerSummaryWorkspaceManifestSha256,
  type ReaderSummaryWorkspacePreparationManifest } from "../../../domain";
import type { ReaderSummaryPublicationCommand } from "../../../ports";
import type { PrismaReaderSummaryClient } from "./prisma-reader-summary-client";
import { readerSummaryV3PublicationGuard } from
  "./prisma-reader-summary-v3-publication-guard";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const cutoff = "2026-09-21T00:00:00.000000Z";
const startedAt = new Date("2026-09-21T00:01:00.000Z");
const interests = [{ schemaVersion: "reader_summary_preparation_config.v1",
  interestId: id(10), interestSha256: sha("first query"),
  rubricVersion: "rubric.v1", rubricSha256: "b".repeat(64),
  inputBuilderVersion: "input.v1", modelConfigVersion: "model.v1" },
{ schemaVersion: "reader_summary_preparation_config.v1",
  interestId: id(11), interestSha256: sha("second query"),
  rubricVersion: "rubric.v1", rubricSha256: "b".repeat(64),
  inputBuilderVersion: "input.v1", modelConfigVersion: "model.v1" }];

// Regression: a frozen workspace may publish no signal only while every
// configured interest remains enabled with the same query and cutoff.
describe("Prisma workspace V3 publication guard", () => {
  it("accepts a complete frozen workspace no-signal result", async () => {
    const fixture = setup();
    await expect(readerSummaryV3PublicationGuard(fixture.client,
      fixture.command)).resolves.toEqual({ allowed: true });
    expect(fixture.sql.some((value) => value.includes("FROM interests i") &&
      value.includes("status='ENABLED'"))).toBe(true);
    expect(fixture.sql.some((value) => value.includes("FOR NO KEY UPDATE OF i")))
      .toBe(true);
    // Regression: a workspace with more than 32 enabled interests must be
    // detected with one excess row, without an unbounded final lock scan.
    expect(fixture.sql.find((value) => value.includes("FROM interests i")))
      .toContain("LIMIT 33");
  });

  // Regression: an assessed useful and relevant source remains signal even
  // when a presentation attempt fails; publication may not relabel it no signal.
  it("rejects no signal with a qualifying frozen workspace assessment", async () => {
    const fixture = setup("admitted_no_signal");
    await expect(readerSummaryV3PublicationGuard(fixture.client,
      fixture.command)).resolves.toEqual({ allowed: false,
      reason: "config_unavailable" });
    expect(fixture.sql.some((value) => value.includes(
      "FROM reader_value_assessments a"))).toBe(true);
  });

  // Regression: a missing citation identity is incomplete presentation,
  // not proof that a useful assessed source has no signal.
  it("rejects no signal for a useful source without citation identity", async () => {
    const fixture = setup("missing_identity_no_signal");
    await expect(readerSummaryV3PublicationGuard(fixture.client,
      fixture.command)).resolves.toEqual({ allowed: false,
      reason: "config_unavailable" });
  });

  // Regression: assessed noise is a truthful no-signal result when the full
  // frozen inventory and scope still pass the publication guard.
  it("accepts no signal with a fully covered noise assessment", async () => {
    const fixture = setup("noise_no_signal");
    await expect(readerSummaryV3PublicationGuard(fixture.client,
      fixture.command)).resolves.toEqual({ allowed: true });
  });

  // Regression: a late or unpinned assessment cannot satisfy frozen workspace
  // coverage during publication, even if its answers say there is no signal.
  it.each(["late_assessment", "unpinned_assessment"] as const)(
    "rejects a %s at publication", async (change) => {
      const fixture = setup(change);
      await expect(readerSummaryV3PublicationGuard(fixture.client,
        fixture.command)).resolves.toEqual({ allowed: false,
        reason: "config_unavailable" });
      const assessmentQuery = fixture.sql.find((value) => value.includes(
        "FROM reader_value_assessments a"));
      expect(assessmentQuery).toContain("a.assessed_at <=");
      expect(assessmentQuery).toContain("ANY(a.pinned_job_ids)");
    });

  // Regression: a completed assessment with the right digest but another
  // rubric version cannot authorize the frozen workspace publication.
  it("rejects a changed assessment rubric version", async () => {
    const fixture = setup("rubric_version_changed");
    await expect(readerSummaryV3PublicationGuard(fixture.client,
      fixture.command)).resolves.toEqual({ allowed: false,
      reason: "config_unavailable" });
  });

  // Regression: a ready assessment can retain its source and rubric digests
  // while its interest query or input builder differs from the frozen config.
  it.each(["interest_hash_changed", "input_builder_changed"] as const)(
    "rejects a %s assessment at publication", async (change) => {
      const fixture = setup(change);
      await expect(readerSummaryV3PublicationGuard(fixture.client,
        fixture.command)).resolves.toEqual({ allowed: false,
        reason: "config_unavailable" });
    });

  // Regression: PostgreSQL JSONB reorders object keys. A frozen workspace
  // manifest must retain the same digest and publication authority.
  it("accepts a JSONB-reordered workspace manifest", async () => {
    const fixture = setup("jsonb_reordered");
    await expect(readerSummaryV3PublicationGuard(fixture.client,
      fixture.command)).resolves.toEqual({ allowed: true });
  });

  // Regression: a changed frozen manifest must fail the final publication
  // transaction even when the active-interest query still matches.
  it("rejects a changed workspace manifest digest", async () => {
    const fixture = setup("digest_changed");
    await expect(readerSummaryV3PublicationGuard(fixture.client,
      fixture.command)).resolves.toEqual({ allowed: false,
      reason: "config_unavailable" });
  });

  // Regression: a stored manifest changed and rehashed after execution began
  // must not replace the job's original frozen candidate authority.
  it("rejects a re-sealed workspace manifest at publication", async () => {
    const fixture = setup("manifest_resealed");
    await expect(readerSummaryV3PublicationGuard(fixture.client,
      fixture.command)).resolves.toEqual({ allowed: false,
      reason: "config_unavailable" });
  });

  // Regression: a row whose period changed after the V2 manifest was frozen
  // cannot publish that window, even if the cutoff and interests still match.
  it("rejects a changed frozen workspace period", async () => {
    const fixture = setup("period_changed");
    await expect(readerSummaryV3PublicationGuard(fixture.client,
      fixture.command)).resolves.toEqual({ allowed: false,
      reason: "config_unavailable" });
  });

  // Regression: adding, disabling, or changing an interest between preparation
  // and publication must fail inside the final transaction.
  it.each(["added", "disabled", "changed"] as const)(
    "rejects a workspace whose enabled set is %s", async (change) => {
      const fixture = setup(change);
      await expect(readerSummaryV3PublicationGuard(fixture.client,
        fixture.command)).resolves.toEqual({ allowed: false,
        reason: "interest_changed" });
      expect(fixture.sql.some((value) => value.includes(
        "UPDATE reader_summary_jobs SET status='FAILED'"))).toBe(true);
    });

  // Regression: a revoked source binding cannot survive as a candidate in a
  // final no-signal publication merely because it has no displayed card.
  it("rejects a revoked candidate binding", async () => {
    const fixture = setup("revoked");
    await expect(readerSummaryV3PublicationGuard(fixture.client,
      fixture.command)).resolves.toEqual({ allowed: false,
      reason: "scope_changed" });
    expect(fixture.sql.some((value) => value.includes("FROM feed_items f")))
      .toBe(true);
  });

  // Regression: changing the source binding of a still-visible FeedItem must
  // fail the final transaction even when its id and interest remain stable.
  it("rejects a rebound visible workspace candidate", async () => {
    const fixture = setup("rebound");
    await expect(readerSummaryV3PublicationGuard(fixture.client,
      fixture.command)).resolves.toEqual({ allowed: false,
      reason: "scope_changed" });
    expect(fixture.sql.some((value) => value.includes(
      "f.source_binding_id::text"))).toBe(true);
  });

  // Regression: a V2 workspace manifest cannot be published from an interest
  // job even if its active-interest query happens to match.
  it("rejects a workspace manifest attached to an interest job", async () => {
    const fixture = setup("scope_mismatch");
    await expect(readerSummaryV3PublicationGuard(fixture.client,
      fixture.command)).resolves.toEqual({ allowed: false,
      reason: "config_unavailable" });
  });

  // Regression: a V3 artifact must not pass through the legacy publication
  // bypass when the persisted job strategy changes after execution began.
  it("rejects a V3 command against a legacy strategy row", async () => {
    const fixture = setup("strategy_changed");
    await expect(readerSummaryV3PublicationGuard(fixture.client,
      fixture.command)).resolves.toEqual({ allowed: false,
      reason: "config_unavailable" });
    expect(fixture.sql).toHaveLength(2);
  });

  // Regression: after the database commits a workspace publication but the
  // caller loses the acknowledgement, an exact replay must remain possible
  // even if the enabled interest set subsequently changes.
  it("accepts exact terminal replay without reopening frozen scope", async () => {
    const fixture = setup("replayed");
    await expect(readerSummaryV3PublicationGuard(fixture.client,
      fixture.command)).resolves.toEqual({ allowed: true });
    expect(fixture.sql).toHaveLength(1);
  });
});

const setup = (change?: "added" | "disabled" | "changed" | "revoked" |
  "replayed" | "rebound" | "scope_mismatch" | "jsonb_reordered" |
  "manifest_resealed" |
  "digest_changed" | "period_changed" | "admitted_no_signal" |
  "noise_no_signal" | "late_assessment" | "unpinned_assessment" |
  "rubric_version_changed" | "interest_hash_changed" |
  "input_builder_changed" | "missing_identity_no_signal" |
  "strategy_changed") => {
  const hasAssessedCandidate = change === "admitted_no_signal" ||
    change === "noise_no_signal" || change === "late_assessment" ||
    change === "unpinned_assessment" || change === "rubric_version_changed" ||
    change === "interest_hash_changed" || change === "input_builder_changed" ||
    change === "missing_identity_no_signal";
  const config = { schemaVersion: "reader_summary_preparation_config.v2",
    interests };
  const candidate = {
    candidateId: id(20), interestId: id(10), assessmentId: id(30),
    sourceItemId: id(21), sourceBindingId: id(22), providerKey: "rss",
    sourceRevisionKey: "revision-1", sourceSnapshotSha256: "c".repeat(64),
    inputSha256: "d".repeat(64), sourceKind: "article",
    canonicalIdentity: change === "missing_identity_no_signal"
      ? "" : "https://example.test/item",
    publishedAt: "2026-09-20T12:00:00.000000Z",
    observedAt: "2026-09-20T12:01:00.000000Z",
  };
  const manifest = { schemaVersion: "reader_summary_preparation_manifest.v2",
    cutoffAt: cutoff,
    periodKey: "weekly:2026-09-14T00:00:00.000Z:2026-09-21T00:00:00.000Z:UTC",
    interests, candidates: change === "revoked" ||
      change === "rebound" ? [{
      candidateId: id(20), interestId: id(10), assessmentId: id(30),
      sourceItemId: id(21), sourceBindingId: id(22), providerKey: "rss",
    }] : hasAssessedCandidate ? [candidate] : [] };
  const storedManifest = change === "jsonb_reordered"
    ? { candidates: manifest.candidates, interests: manifest.interests,
      cutoffAt: manifest.cutoffAt, periodKey: manifest.periodKey,
      schemaVersion: manifest.schemaVersion }
    : change === "manifest_resealed"
      ? { ...manifest, extra: "changed-after-execution" }
    : manifest;
  const row = { status: change === "replayed" ? "COMPLETED" : "RUNNING",
    scope_type: change === "scope_mismatch" ? "interest" : "workspace",
    reader_summary_artifact_id: change === "replayed" ? id(4) : null,
    selection_strategy: change === "strategy_changed" ? "legacy_v2" :
      "jev_primary_v3", terminal_failure_code: null,
    preparation_manifest: storedManifest,
    preparation_manifest_sha256: change === "digest_changed"
      ? "0".repeat(64) : readerSummaryWorkspaceManifestSha256(storedManifest as unknown as
        ReaderSummaryWorkspacePreparationManifest),
    preparation_config: config,
    period_key: change === "period_changed" ? "weekly:changed-window" :
      manifest.periodKey,
    started_at: startedAt, preparation_cutoff_at: cutoff,
    preparation_deadline_at: "2026-09-21T00:15:00.000000Z",
    workspace_live: true, tenant_live: true };
  const enabled = [{ id: id(10), query: "first query" },
    { id: id(11), query: "second query" }];
  if (change === "added") enabled.push({ id: id(12), query: "third query" });
  if (change === "disabled") enabled.shift();
  if (change === "changed") enabled[0] = { id: id(10), query: "changed query" };
  const sql: string[] = [];
  const client = { $queryRaw: async (parts: TemplateStringsArray) => {
    const text = parts.join("?");
    sql.push(text);
    if (text.includes("FROM reader_summary_jobs j")) return [row];
    if (text.includes("FROM interests i")) return enabled;
    if (text.includes("FROM feed_items f") && change === "rebound") {
      return [{ id: id(20), interest_id: id(10), source_item_id: id(21),
        source_binding_id: id(99), provider_key: "rss" }];
    }
    if (text.includes("FROM feed_items f") && hasAssessedCandidate) {
      return [{ id: candidate.candidateId, interest_id: candidate.interestId,
        source_item_id: candidate.sourceItemId,
        source_binding_id: candidate.sourceBindingId,
        provider_key: candidate.providerKey }];
    }
    if (text.includes("FROM reader_value_assessments a") &&
        hasAssessedCandidate) {
      if (change === "late_assessment" || change === "unpinned_assessment") {
        return [];
      }
      return [{ id: candidate.assessmentId,
        interest_id: candidate.interestId,
        source_item_id: candidate.sourceItemId,
        source_revision_key: candidate.sourceRevisionKey,
        source_snapshot_sha256: candidate.sourceSnapshotSha256,
        input_sha256: candidate.inputSha256,
        interest_sha256: change === "interest_hash_changed"
          ? "0".repeat(64) : interests[0]!.interestSha256,
        rubric_version: change === "rubric_version_changed"
          ? "rubric.v2" : "rubric.v1", rubric_sha256: "b".repeat(64),
        input_builder_version: change === "input_builder_changed"
          ? "input.v2" : "input.v1",
        model_config_version: "model.v1", assessed_at: cutoff,
        result: answers(change === "noise_no_signal" ||
          change === "rubric_version_changed" ? "noise" : "useful"),
        input_snapshot: { safety: "allowed" } }];
    }
    return [];
  } } as unknown as PrismaReaderSummaryClient;
  const command = { finalJob: { toSnapshot: () => ({ id: id(1),
    tenantId: id(2), workspaceId: id(3), status: "completed", startedAt,
    selectionStrategy: "jev_primary_v3",
    preparationConfig: config,
    preparationManifestSha256: readerSummaryWorkspaceManifestSha256(manifest as unknown as
      ReaderSummaryWorkspacePreparationManifest),
    scope: { type: "workspace" },
    period: { periodKey: manifest.periodKey,
      startedAt: new Date("2026-09-14T00:00:00.000Z"),
      endedAt: new Date("2026-09-21T00:00:00.000Z") } }) },
  artifact: { toSnapshot: () => ({ readerSummaryId: id(4),
    promotionAttestations: [], qualityFlags: ["no_signal"],
    period: { periodKey: manifest.periodKey },
    sourceWindow: { exactIngestionCutoff: cutoff,
      ingestionCutoff: new Date(cutoff) } }) } } as unknown as ReaderSummaryPublicationCommand;
  return { command, client, sql };
};

const answers = (usefulness: "noise" | "useful") => {
  const answer = (choice: string, labels: readonly string[]) => ({ choice,
    probabilities: Object.fromEntries(labels.map((label) =>
      [label, label === choice ? 1 : 0])), confidence: 0.9,
    choiceDiffersFromArgmax: false, probabilityTie: false });
  return { usefulness: answer(usefulness, ["noise", "context", "useful",
    "important", "insufficient_context"]),
    relevance: answer("central", ["unrelated", "adjacent", "relevant",
      "central", "insufficient_context"]),
    context_sufficiency: answer("sufficient", ["insufficient", "partial",
      "sufficient"]),
    evidence_basis: answer("observation", ["observation", "described_data",
      "linked_claim", "unsupported_claim", "no_claim",
      "insufficient_context"]) };
};
