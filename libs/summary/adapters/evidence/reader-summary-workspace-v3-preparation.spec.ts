import { createHash } from "node:crypto";
import type { ReaderValueSummaryPreparation } from
  "@social-monitor/relevance/application/contracts/reader-value-summary-preparation";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { ReaderSummaryJob, readerSummaryWorkspaceManifestSha256,
  sameReaderSummaryPreparationConfig } from "../../domain";
import { InMemoryReaderSummaryJobRepository } from
  "../persistence/in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryV3Preflight } from
  "../persistence/in-memory-reader-summary-v3-preflight";
import { RelevanceReaderSummaryV3PreparationSource } from
  "./relevance-reader-summary-v3-preparation-source";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const cutoff = "2026-09-21T00:00:00.000000Z";

// Regression: a pending workspace job must freeze both interest identities and
// per-interest candidate provenance before any global promotion can run.
describe("Workspace V3 frozen preparation", () => {
  // Regression: PostgreSQL JSONB can reorder object keys while preserving the
  // same frozen per-interest configuration.
  it("compares frozen configuration by fields across JSONB key order", () => {
    const config = { schemaVersion: "reader_summary_preparation_config.v2" as const,
      interests: [{ schemaVersion: "reader_summary_preparation_config.v1" as const,
        interestId: id(10), interestSha256: "a".repeat(64),
        rubricVersion: "rubric.v1", rubricSha256: "b".repeat(64),
        inputBuilderVersion: "input.v1", modelConfigVersion: "model.v1" }] };
    const reordered = { interests: [{ modelConfigVersion: "model.v1",
      inputBuilderVersion: "input.v1", rubricSha256: "b".repeat(64),
      rubricVersion: "rubric.v1", interestSha256: "a".repeat(64),
      interestId: id(10), schemaVersion: "reader_summary_preparation_config.v1" as const }],
      schemaVersion: "reader_summary_preparation_config.v2" as const };
    expect(sameReaderSummaryPreparationConfig(config, reordered)).toBe(true);
  });
  it("prepares two interests in deterministic order with one job pin and cutoff", async () => {
    const fixture = await setup();
    const result = await fixture.preflight.advance(command(fixture.job));

    expect(result.kind).toBe("deferred");
    const manifest = result.job.toSnapshot().preparationManifest;
    expect(manifest?.schemaVersion).toBe("reader_summary_preparation_manifest.v2");
    if (manifest?.schemaVersion !== "reader_summary_preparation_manifest.v2") return;
    expect(manifest.interests.map((value) => value.interestId))
      .toEqual([id(10), id(11)]);
    expect(manifest.periodKey).toBe(fixture.job.toSnapshot().period.periodKey);
    expect(manifest.candidates.map((value) => value.interestId))
      .toEqual([id(10), id(11)]);
    expect(fixture.prepared).toEqual([
      { interestId: id(10), jobId: id(1), cutoffAt: cutoff,
        retentionComplete: true },
      { interestId: id(11), jobId: id(1), cutoffAt: cutoff,
        retentionComplete: true },
    ]);
  });

  // Regression: the workspace manifest must freeze the requested daily window;
  // a weekly-only preparation would publish an incorrect daily inventory.
  it("freezes a daily workspace window with the same per-interest cutoff", async () => {
    const fixture = await setup("daily");
    const result = await fixture.preflight.advance(command(fixture.job));
    const manifest = result.job.toSnapshot().preparationManifest;
    expect(manifest?.schemaVersion).toBe("reader_summary_preparation_manifest.v2");
    if (manifest?.schemaVersion !== "reader_summary_preparation_manifest.v2") return;
    expect(manifest.periodKey).toBe(fixture.job.toSnapshot().period.periodKey);
    expect(fixture.prepared.map((value) => value.cutoffAt))
      .toEqual([cutoff, cutoff]);
  });

  // Regression: PostgreSQL JSONB changes object key order, while a mutation
  // to a frozen candidate must change the manifest digest on retry.
  it("seals the complete workspace manifest across JSONB key order", async () => {
    const fixture = await setup();
    const result = await fixture.preflight.advance(command(fixture.job));
    const manifest = result.job.toSnapshot().preparationManifest;
    expect(manifest?.schemaVersion).toBe("reader_summary_preparation_manifest.v2");
    if (manifest?.schemaVersion !== "reader_summary_preparation_manifest.v2") return;
    const reordered = { candidates: manifest.candidates.map((candidate) =>
      Object.fromEntries(Object.entries(candidate).reverse()) as typeof candidate),
      interests: manifest.interests.map((entry) =>
        Object.fromEntries(Object.entries(entry).reverse()) as typeof entry),
      periodKey: manifest.periodKey, cutoffAt: manifest.cutoffAt,
      schemaVersion: manifest.schemaVersion };
    expect(readerSummaryWorkspaceManifestSha256(reordered))
      .toBe(result.job.toSnapshot().preparationManifestSha256);
    expect(readerSummaryWorkspaceManifestSha256({ ...manifest,
      candidates: [{ ...manifest.candidates[0]!,
        sourceRevisionKey: "different-revision" },
      ...manifest.candidates.slice(1)] }))
      .not.toBe(result.job.toSnapshot().preparationManifestSha256);
    // Regression: changing the frozen period changes the workspace manifest
    // identity even if the interest set and source cutoff remain identical.
    expect(readerSummaryWorkspaceManifestSha256({ ...manifest,
      periodKey: "weekly:another-window" }))
      .not.toBe(result.job.toSnapshot().preparationManifestSha256);
  });

  // Regression: a pending workspace job must never rehydrate with a manifest
  // from a different period, even if all candidate assessments are reusable.
  it("rejects a frozen manifest from another period", async () => {
    const fixture = await setup();
    const result = await fixture.preflight.advance(command(fixture.job));
    const snapshot = result.job.toSnapshot();
    const manifest = snapshot.preparationManifest;
    expect(manifest?.schemaVersion)
      .toBe("reader_summary_preparation_manifest.v2");
    if (manifest?.schemaVersion !==
        "reader_summary_preparation_manifest.v2") return;
    expect(() => ReaderSummaryJob.rehydrate({ ...snapshot,
      preparationManifest: { ...manifest,
        periodKey: "weekly:another-window" },
    })).toThrow("period changed");
  });

  // Regression: a frozen workspace manifest with a FeedItem outside its
  // period or observed after cutoff must not later publish false no signal.
  it.each(["published", "observed"] as const)(
    "rejects a %s timestamp outside the frozen workspace window", async (field) => {
      const fixture = await setup();
      const pending = await fixture.preflight.advance(command(fixture.job));
      const snapshot = pending.job.toSnapshot();
      const manifest = snapshot.preparationManifest;
      expect(manifest?.schemaVersion).toBe("reader_summary_preparation_manifest.v2");
      if (manifest?.schemaVersion !== "reader_summary_preparation_manifest.v2") return;
      const changed = { ...manifest, candidates: [{ ...manifest.candidates[0]!,
        [field === "published" ? "publishedAt" : "observedAt"]:
          "2026-09-21T00:00:00.000001Z" }, ...manifest.candidates.slice(1)] };

      expect(() => ReaderSummaryJob.rehydrate({ ...snapshot,
        preparationManifest: changed })).toThrow(/outside frozen window/u);
      expect(() => pending.job.freezePreparationManifest({ manifest: changed,
        manifestSha256: readerSummaryWorkspaceManifestSha256(changed) }))
        .toThrow(/outside frozen window/u);
    });

  // Regression: a direct manifest freeze must not accept another source
  // cutoff or per-interest rubric, even when given a matching new digest.
  it.each(["cutoff", "interest_config"] as const)(
    "rejects a workspace manifest freeze with changed %s", async (change) => {
      const fixture = await setup();
      const pending = await fixture.preflight.advance(command(fixture.job));
      const manifest = pending.job.toSnapshot().preparationManifest;
      expect(manifest?.schemaVersion).toBe("reader_summary_preparation_manifest.v2");
      if (manifest?.schemaVersion !== "reader_summary_preparation_manifest.v2") return;
      const changed = change === "cutoff"
        ? { ...manifest, cutoffAt: "2026-09-20T23:59:59.999999Z" }
        : { ...manifest, interests: [{ ...manifest.interests[0]!,
          rubricSha256: "0".repeat(64) }, ...manifest.interests.slice(1)] };

      expect(() => pending.job.freezePreparationManifest({ manifest: changed,
        manifestSha256: readerSummaryWorkspaceManifestSha256(changed) }))
        .toThrow("manifest identity changed");
    });

  // Regression: one interest cannot prepare against a different cutoff while
  // the workspace manifest claims the job's original exact source snapshot.
  it("fails preparation when an interest returns another cutoff", async () => {
    const fixture = await setup();
    fixture.wrongInterestCutoff = true;

    const result = await fixture.preflight.advance(command(fixture.job));

    expect(result.job.toSnapshot()).toMatchObject({ status: "failed",
      terminalFailureCode: "config_unavailable" });
  });

  // Regression: a persisted workspace manifest from another cutoff must not
  // pass readiness even when all candidates and interest hashes still match.
  it("rejects coverage after the frozen source cutoff changes", async () => {
    const fixture = await setup();
    const pending = await fixture.preflight.advance(command(fixture.job));
    const manifest = pending.job.toSnapshot().preparationManifest;
    expect(manifest?.schemaVersion).toBe("reader_summary_preparation_manifest.v2");
    if (manifest?.schemaVersion !== "reader_summary_preparation_manifest.v2") return;

    await expect(fixture.source.coverage({ job: pending.job,
      manifest: { ...manifest, cutoffAt: "2026-09-20T23:59:59.999999Z" },
      deadlineAt: pending.job.toSnapshot().preparationDeadlineAt! }))
      .resolves.toEqual({ status: "unavailable", code: "config_unavailable" });
  });

  // Regression: a persisted manifest with a different per-interest rubric
  // cannot pass in-memory readiness despite an otherwise covered assessment.
  it("rejects readiness when a frozen interest config changes in the manifest", async () => {
    const fixture = await setup();
    const pending = await fixture.preflight.advance(command(fixture.job));
    const manifest = pending.job.toSnapshot().preparationManifest;
    expect(manifest?.schemaVersion).toBe("reader_summary_preparation_manifest.v2");
    if (manifest?.schemaVersion !== "reader_summary_preparation_manifest.v2") return;

    await expect(fixture.source.coverage({ job: pending.job,
      manifest: { ...manifest, interests: [{ ...manifest.interests[0]!,
        rubricSha256: "0".repeat(64) }, ...manifest.interests.slice(1)] },
      deadlineAt: pending.job.toSnapshot().preparationDeadlineAt! }))
      .resolves.toEqual({ status: "unavailable", code: "config_unavailable" });
  });

  // Regression: an archived, changed, or newly enabled interest may not
  // silently change a frozen pending workspace job.
  it.each(["removed", "changed", "added"] as const)(
    "fails a frozen pending job when the active set is %s", async (change) => {
      const fixture = await setup();
      const first = await fixture.preflight.advance(command(fixture.job));
      expect(first.kind).toBe("deferred");
      if (change === "removed") fixture.enabled = fixture.enabled.slice(1);
      if (change === "changed") fixture.enabled[0] = { ...fixture.enabled[0]!,
        query: "new query" };
      if (change === "added") fixture.enabled.push({ interestId: id(12),
        query: "third query" });

      const second = await fixture.preflight.advance(command(first.job));
      expect(second.kind).toBe("terminal");
      expect(second.job.toSnapshot()).toMatchObject({ status: "failed",
        terminalFailureCode: "config_unavailable" });
    });

  // Regression: a workspace with no enabled interests has no truthful V3
  // assessment inventory and must fail explicitly.
  it("fails an empty enabled set", async () => {
    const fixture = await setup();
    fixture.enabled = [];
    const result = await fixture.preflight.advance(command(fixture.job));
    expect(result.job.toSnapshot()).toMatchObject({ status: "failed",
      terminalFailureCode: "config_unavailable" });
  });

  // Regression: an assessment read under a frozen interest can still carry
  // another interest in a faulty store response. Readiness must reject the
  // whole workspace instead of treating that assessment as covered.
  it("rejects a cross-interest assessed response during readiness", async () => {
    const fixture = await setup();
    const pending = await fixture.preflight.advance(command(fixture.job));
    expect(pending.kind).toBe("deferred");
    fixture.crossInterestRead = true;

    const result = await fixture.preflight.advance(command(pending.job));

    expect(result.job.toSnapshot()).toMatchObject({ status: "failed",
      terminalFailureCode: "assessment_unavailable" });
  });

  // Regression: an assessment for another rubric version must not satisfy
  // the frozen workspace configuration even when its rubric hash matches.
  it("rejects a changed rubric version during in-memory readiness", async () => {
    const fixture = await setup();
    const pending = await fixture.preflight.advance(command(fixture.job));
    fixture.wrongRubricVersion = true;

    const result = await fixture.preflight.advance(command(pending.job));

    expect(result.job.toSnapshot()).toMatchObject({ status: "failed",
      terminalFailureCode: "assessment_unavailable" });
  });

  // Regression: an assessment for the same interest ID but an older query
  // hash must not cover the frozen workspace configuration.
  it("rejects a changed interest query hash during in-memory readiness", async () => {
    const fixture = await setup();
    const pending = await fixture.preflight.advance(command(fixture.job));
    fixture.wrongInterestHash = true;

    const result = await fixture.preflight.advance(command(pending.job));

    expect(result.job.toSnapshot()).toMatchObject({ status: "failed",
      terminalFailureCode: "assessment_unavailable" });
  });

  // Regression: a FeedItem rebound to another source binding after freeze
  // cannot pass workspace readiness on the still-cached source assessment.
  it("rejects a rebound frozen candidate during in-memory readiness", async () => {
    const fixture = await setup();
    const pending = await fixture.preflight.advance(command(fixture.job));
    expect(pending.kind).toBe("deferred");
    fixture.liveBindingId = id(99);

    const result = await fixture.preflight.advance(command(pending.job));

    expect(result.job.toSnapshot()).toMatchObject({ status: "failed",
      terminalFailureCode: "assessment_unavailable" });
  });

  // Regression: no-signal publication needs the full assessed inventory to
  // distinguish genuine noise from a useful candidate whose presentation failed.
  it.each(["useful", "noise"] as const)(
    "reports whether frozen workspace assessments contain %s signal", async (choice) => {
      const fixture = await setup();
      const pending = await fixture.preflight.advance(command(fixture.job));
      const manifest = pending.job.toSnapshot().preparationManifest;
      expect(manifest?.schemaVersion).toBe("reader_summary_preparation_manifest.v2");
      if (manifest?.schemaVersion !== "reader_summary_preparation_manifest.v2") return;
      fixture.assessmentChoice = choice;

      await expect(fixture.source.coverage({ job: pending.job, manifest,
        deadlineAt: pending.job.toSnapshot().preparationDeadlineAt! }))
        .resolves.toEqual({ status: "ready",
          hasPromotableSignal: choice === "useful" });
    });

  // Regression: a useful assessment with a missing citation URL remains
  // signal, so a later presentation failure cannot be relabeled no signal.
  it("retains useful signal when the canonical identity is incomplete", async () => {
    const fixture = await setup();
    fixture.missingCanonicalIdentity = true;
    const pending = await fixture.preflight.advance(command(fixture.job));
    const manifest = pending.job.toSnapshot().preparationManifest;
    expect(manifest?.schemaVersion).toBe("reader_summary_preparation_manifest.v2");
    if (manifest?.schemaVersion !== "reader_summary_preparation_manifest.v2") return;
    fixture.assessmentChoice = "useful";

    await expect(fixture.source.coverage({ job: pending.job, manifest,
      deadlineAt: pending.job.toSnapshot().preparationDeadlineAt! }))
      .resolves.toEqual({ status: "ready", hasPromotableSignal: true });
  });

  // Regression: a workspace with more than the measured interest ceiling
  // cannot be silently truncated to the first page of interests.
  it("reports an over-budget enabled interest set", async () => {
    const fixture = await setup();
    fixture.enabled = Array.from({ length: 33 }, (_, index) => ({
      interestId: id(100 + index), query: `query ${index}` }));
    const result = await fixture.preflight.advance(command(fixture.job));
    expect(result.job.toSnapshot()).toMatchObject({ status: "failed",
      terminalFailureCode: "assessment_inventory_over_budget" });
    expect(fixture.prepared).toEqual([]);
  });

  // Regression: source bytes consumed across interests must share one
  // workspace budget instead of resetting for each interest.
  it("reports a measured over-budget weekly workspace inventory", async () => {
    const fixture = await setup();
    fixture.enabled.push(...[12, 13, 14].map((n) => ({ interestId: id(n),
      query: `query ${n}` })));
    fixture.measuredSourceBytes = 32 * 1024 * 1024;

    const result = await fixture.preflight.advance(command(fixture.job));
    expect(result.job.toSnapshot()).toMatchObject({ status: "failed",
      terminalFailureCode: "assessment_inventory_over_budget" });
    expect(fixture.byteBudgets).toEqual([
      32 * 1024 * 1024, 32 * 1024 * 1024, 32 * 1024 * 1024,
      32 * 1024 * 1024, 0,
    ]);
  });
});

const command = (job: ReaderSummaryJob) => ({ job,
  requestedAt: job.toSnapshot().requestedAt,
  startedAt: new Date("2026-09-21T00:00:01.000Z") });

const setup = async (cadence: "daily" | "weekly" = "weekly") => {
  const job = ReaderSummaryJob.request({ id: id(1), tenantId: tenantId(id(2)),
    workspaceId: workspaceId(id(3)), scope: { type: "workspace" },
    period: { cadence, startedAt: new Date(cadence === "daily"
      ? "2026-09-20T00:00:00Z" : "2026-09-14T00:00:00Z"),
      endedAt: new Date("2026-09-21T00:00:00Z"), timezone: "UTC",
      periodKey: `${cadence}:${cadence === "daily" ? "2026-09-20" :
        "2026-09-14"}T00:00:00.000Z:2026-09-21T00:00:00.000Z:UTC` },
    idempotencyKey: "workspace-v3", requestedAt: new Date(cutoff),
    selectionStrategy: "jev_primary_v3" });
  const prepared: Array<{ interestId: string; jobId: string; cutoffAt: string;
    retentionComplete: boolean }> = [];
  const byteBudgets: number[] = [];
  const fixture = { enabled: [{ interestId: id(11), query: "second query" },
    { interestId: id(10), query: "first query" }], prepared, byteBudgets,
    measuredSourceBytes: 1, crossInterestRead: false,
    wrongRubricVersion: false, wrongInterestHash: false,
    wrongInterestCutoff: false,
    missingCanonicalIdentity: false,
    liveBindingId: id(30),
    assessmentChoice: undefined as "useful" | "noise" | undefined };
  const preparation: ReaderValueSummaryPreparation = {
    configuration: async (request) => {
      const entry = fixture.enabled.find((value) => value.interestId === request.interestId);
      if (entry === undefined) return { ok: false, code: "config_unavailable" };
      return { ok: true, config: { schemaVersion: "reader_summary_preparation_config.v1",
        interestId: entry.interestId, interestSha256: hash(entry.query),
        rubricVersion: "rubric.v1", rubricSha256: "b".repeat(64),
        inputBuilderVersion: "input.v1", modelConfigVersion: "model.v1" } };
    },
    prepare: async (request, config) => {
      prepared.push({ interestId: request.interestId, jobId: request.jobId,
        cutoffAt: request.cutoffAt,
        retentionComplete: request.requireRetentionCompleteness === true });
      byteBudgets.push(request.sourceByteBudget ?? -1);
      const manifest = { schemaVersion: "reader_summary_preparation_manifest.v1" as const,
        cutoffAt: fixture.wrongInterestCutoff && request.interestId === id(11)
          ? "2026-09-20T23:59:59.999999Z" : request.cutoffAt,
        interestSha256: config.interestSha256,
        rubricSha256: config.rubricSha256,
        inputBuilderVersion: config.inputBuilderVersion,
        modelConfigVersion: config.modelConfigVersion,
        candidates: [{ candidateId: request.interestId === id(10) ? id(20) : id(21),
          sourceBindingId: id(30), providerKey: "rss", sourceItemId: id(40),
          sourceRevisionKey: "revision-1", sourceSnapshotSha256: "c".repeat(64),
          assessmentId: request.interestId === id(10) ? id(50) : id(51),
          inputSha256: "d".repeat(64), publishedAt: "2026-09-20T12:00:00.000000Z",
          observedAt: "2026-09-20T12:01:00.000000Z", sourceKind: "article",
          canonicalIdentity: fixture.missingCanonicalIdentity
            ? "" : "https://example.test/source" }] };
      return { ok: true, config, manifest,
        manifestSha256: hash(JSON.stringify(manifest)),
        sourceBytes: fixture.measuredSourceBytes };
    },
  };
  const source = new RelevanceReaderSummaryV3PreparationSource(preparation,
    { read: async (_scope, interestId, references) => references.map((value) =>
      value.sourceBindingId !== fixture.liveBindingId
        ? { status: "unavailable" as const, assessmentId: value.assessmentId }
        : { status: "available" as const, assessment: { id: value.assessmentId,
        state: fixture.crossInterestRead || fixture.wrongRubricVersion ||
          fixture.wrongInterestHash ||
          fixture.assessmentChoice !== undefined
          ? "assessed" as const : "pending" as const,
        assessedAt: fixture.crossInterestRead || fixture.wrongRubricVersion ||
          fixture.wrongInterestHash ||
          fixture.assessmentChoice !== undefined
          ? "2026-09-21T00:00:00.000000Z" : null,
        input: { interestId: fixture.crossInterestRead ? id(99) : interestId,
          sourceItemId: id(40), sourceRevisionKey: "revision-1",
          sourceSnapshotSha256: "c".repeat(64), inputSha256: "d".repeat(64),
          interestSha256: fixture.wrongInterestHash ? "0".repeat(64) :
            hash(fixture.enabled.find((entry) =>
              entry.interestId === interestId)!.query),
          rubricVersion: fixture.wrongRubricVersion ? "rubric.v2" : "rubric.v1",
          rubricSha256: "b".repeat(64), inputBuilderVersion: "input.v1",
          modelConfigVersion: "model.v1",
          snapshot: { safety: "allowed" } },
        answers: fixture.assessmentChoice === undefined ? null :
          answers(fixture.assessmentChoice) } as never }) },
    { listEnabled: async () => fixture.enabled });
  const jobs = new InMemoryReaderSummaryJobRepository();
  await jobs.save(job);
  return Object.assign(fixture, { job, source,
    preflight: new InMemoryReaderSummaryV3Preflight(jobs, source) });
};

const answers = (usefulness: "useful" | "noise") => {
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
