import { createHash } from "node:crypto";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryJob, readerSummaryWorkspaceManifestSha256 } from
  "../../../domain";
import type { ReaderSummaryV3PreparationSourcePort } from "../../../ports";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import type { PrismaReaderSummaryJobRepository } from
  "./prisma-reader-summary-job.repository";
import { PrismaReaderSummaryV3Preflight } from "./prisma-reader-summary-v3-preflight";

describe("PrismaReaderSummaryV3Preflight execution fence", () => {
  it("returns already_running when a peer claims during configuration refresh", async () => {
    const requested = requestedJob();
    const running = frozenJob().startPrepared({ startedAt: now, readyAt: now });
    const tx = transactionReturning({ ...lockedRow(), status: "RUNNING" });
    const jobs = repositoryReturning(requested, running);
    const source: ReaderSummaryV3PreparationSourcePort = {
      configuration: jest.fn<ReturnType<ConfigurationMethod>,
        Parameters<ConfigurationMethod>>(async () => ({ ok: true, config })),
      prepare: jest.fn(), coverage: jest.fn(),
    };

    await expect(new PrismaReaderSummaryV3Preflight(prismaFor(tx), jobs, source)
      .advance({ job: requested, requestedAt: now, startedAt: now }))
      .resolves.toMatchObject({ kind: "already_running", job: running });
    expect(source.prepare).not.toHaveBeenCalled();
  });

  it("returns already_running when a peer claims during manifest refresh", async () => {
    const requested = configuredJob();
    const running = frozenJob().startPrepared({ startedAt: now, readyAt: now });
    const tx = transactionReturning({ ...lockedRow(), status: "RUNNING" });
    const jobs = repositoryReturning(requested, running);
    const source: ReaderSummaryV3PreparationSourcePort = {
      configuration: jest.fn(), prepare: jest.fn(async () => preparation()),
      coverage: jest.fn(),
    };

    await expect(new PrismaReaderSummaryV3Preflight(prismaFor(tx), jobs, source)
      .advance({ job: requested, requestedAt: now, startedAt: now }))
      .resolves.toMatchObject({ kind: "already_running", job: running });
  });

  it("returns already_running when a peer claims while a source failure is handled", async () => {
    const requested = requestedJob();
    const running = frozenJob().startPrepared({ startedAt: now, readyAt: now });
    const tx = transactionReturning({ ...lockedRow(), status: "RUNNING" });
    const jobs = repositoryReturning(requested, running);
    const source: ReaderSummaryV3PreparationSourcePort = {
      configuration: jest.fn<ReturnType<ConfigurationMethod>,
        Parameters<ConfigurationMethod>>(async () => ({ ok: false,
          code: "config_unavailable" })),
      prepare: jest.fn(), coverage: jest.fn(),
    };

    await expect(new PrismaReaderSummaryV3Preflight(prismaFor(tx), jobs, source)
      .advance({ job: requested, requestedAt: now, startedAt: now }))
      .resolves.toMatchObject({ kind: "already_running", job: running });
  });

  it("keeps an actual source failure terminal", async () => {
    const requested = requestedJob();
    const failed = requested.failPreparation({ failedAt: now,
      failureReason: "config_unavailable", terminalFailureCode: "config_unavailable" });
    const tx = transactionReturning({ ...lockedRow(), preparation_config: null,
      preparation_manifest: null, preparation_manifest_sha256: null });
    const jobs = repositoryReturning(requested, failed);
    const source: ReaderSummaryV3PreparationSourcePort = {
      configuration: jest.fn<ReturnType<ConfigurationMethod>,
        Parameters<ConfigurationMethod>>(async () => ({ ok: false,
          code: "config_unavailable" })),
      prepare: jest.fn(), coverage: jest.fn(),
    };

    await expect(new PrismaReaderSummaryV3Preflight(prismaFor(tx), jobs, source)
      .advance({ job: requested, requestedAt: now, startedAt: now }))
      .resolves.toMatchObject({ kind: "terminal", job: failed });
  });

  it("claims a microsecond DB clock with a fence stable through JS Date rehydration", async () => {
    const requested = frozenJob();
    const running = requested.startPrepared({ startedAt: now, readyAt: now });
    const sql: string[] = [];
    const tx = { $queryRaw: jest.fn(async (parts: TemplateStringsArray) => {
      const text = parts.join("?");
      sql.push(text);
      if (text.includes("FROM reader_summary_jobs")) return [lockedRow()];
      if (text.includes("FROM workspaces")) return [{ live: true }];
      if (text.includes("FROM interests")) {
        return [{ id: id(4), query: interestQuery }];
      }
      if (text.includes("UPDATE reader_summary_jobs SET status='RUNNING'")) {
        return [{ started_at: now }];
      }
      return [];
    }) };
    const prisma = { ...tx, $transaction: async (operation: (client: typeof tx) =>
      Promise<unknown>) => operation(tx) } as unknown as PrismaSummaryClient;
    const jobs = { findById: jest.fn()
      .mockResolvedValueOnce(requested).mockResolvedValueOnce(running) } as unknown as
      PrismaReaderSummaryJobRepository;

    const result = await new PrismaReaderSummaryV3Preflight(prisma, jobs, unusedSource())
      .advance({ job: requested, requestedAt: now, startedAt: now });

    expect(result.kind).toBe("claimed");
    expect(new Date(databaseClockText)).toEqual(now);
    expect(sql.some((text) => text.includes(
      "started_at=date_trunc('milliseconds', clock_timestamp())"))).toBe(true);
    expect(sql.some((text) => text.includes(
      "to_char(preparation_deadline_at AT TIME ZONE 'UTC'"))).toBe(true);
    // Regression: an interest job must not lock every enabled workspace
    // interest while claiming readiness in a large workspace.
    const interestRead = sql.find((text) => text.includes("FROM interests"));
    expect(interestRead).toContain("OR id::text=");
    expect(interestRead).toContain("LIMIT 33");
  });

  it("does not return a claim when cancellation commits before the job reread", async () => {
    const requested = frozenJob();
    const cancelled = requested.startPrepared({ startedAt: now, readyAt: now })
      .cancelByOperator({ cancelledAt: new Date(now.getTime() + 1) });
    const tx = readyClaimTransaction(now);
    const jobs = repositoryReturning(requested, cancelled);

    await expect(new PrismaReaderSummaryV3Preflight(prismaFor(tx), jobs, unusedSource())
      .advance({ job: requested, requestedAt: now, startedAt: now }))
      .resolves.toMatchObject({ kind: "terminal", job: cancelled });
  });

  it("does not return a claim for a different running execution fence", async () => {
    const requested = frozenJob();
    const replacement = requested.startPrepared({
      startedAt: new Date(now.getTime() + 1), readyAt: now,
    });
    const tx = readyClaimTransaction(now);
    const jobs = repositoryReturning(requested, replacement);

    await expect(new PrismaReaderSummaryV3Preflight(prismaFor(tx), jobs, unusedSource())
      .advance({ job: requested, requestedAt: now, startedAt: now }))
      .resolves.toMatchObject({ kind: "already_running", job: replacement });
  });

  it("treats duplicate delivery of the running claim as idempotent", async () => {
    const running = frozenJob().startPrepared({ startedAt: now, readyAt: now });
    const tx = transactionReturning({ ...lockedRow(), status: "RUNNING",
      started_at: now });
    const jobs = { findById: jest.fn().mockResolvedValue(running) } as unknown as
      PrismaReaderSummaryJobRepository;

    await expect(new PrismaReaderSummaryV3Preflight(prismaFor(tx), jobs, unusedSource())
      .advance({ job: running, requestedAt: now, startedAt: now }))
      .resolves.toMatchObject({ kind: "already_running" });
    expect(tx.$queryRaw.mock.calls.some(([parts]) => (parts as TemplateStringsArray)
      .join("?").includes("AS expired"))).toBe(true);
  });

  it.each(["daily", "weekly"] as const)(
    "atomically recovers a %s workspace crash after claim using the DB lease and frozen manifest",
    async (cadence) => {
      const prepared = workspaceFrozenJob(cadence);
      const startedAt = new Date("2026-09-21T00:00:00Z");
      const recoveryAt = new Date("2026-09-23T00:00:00Z");
      const old = ReaderSummaryJob.rehydrate({ ...prepared.startPrepared({
        startedAt, readyAt: startedAt }).toSnapshot(),
        failureReason: "v3_pre_provider_claim" });
      const recovered = ReaderSummaryJob.rehydrate({ ...old.toSnapshot(),
        startedAt: recoveryAt, failureReason: "v3_pre_provider_claim" });
      const frozen = old.toSnapshot();
      const sql: string[] = [];
      const tx = { $queryRaw: jest.fn(async (parts: TemplateStringsArray) => {
        const statement = parts.join("?");
        sql.push(statement);
        if (statement.includes("FROM reader_summary_jobs")) return [{ ...lockedRow(),
          status: "RUNNING", started_at: startedAt,
          failure_reason: "v3_pre_provider_claim",
          preparation_config: Object.fromEntries(Object.entries(
            frozen.preparationConfig ?? {}).reverse()),
          preparation_manifest: Object.fromEntries(Object.entries(
            frozen.preparationManifest ?? {}).reverse()),
          preparation_manifest_sha256: frozen.preparationManifestSha256,
          preparation_cutoff_at: frozen.preparationCutoffAt,
          period_key: frozen.period.periodKey }];
        if (statement.includes("AS expired")) return [{ expired: true }];
        if (statement.includes("status='RUNNING'")) {
          return [{ started_at: recoveryAt }];
        }
        return [];
      }) };
      const source = unusedSource();
      const outcome = await new PrismaReaderSummaryV3Preflight(prismaFor(tx),
        repositoryReturning(old, recovered), source).advance({ job: old,
          requestedAt: recoveryAt, startedAt });
      expect(outcome).toMatchObject({ kind: "claimed", job: recovered,
        manifest: frozen.preparationManifest });
      expect(sql.some((statement) => statement.includes(
        "clock_timestamp() -"))).toBe(true);
      expect(sql.some((statement) => statement.includes(
        "started_at + interval '1 millisecond'"))).toBe(true);
      expect(sql.some((statement) => statement.includes(
        "preparation_config="))).toBe(false);
      expect(source.configuration).not.toHaveBeenCalled();
      expect(source.prepare).not.toHaveBeenCalled();
      expect(source.coverage).not.toHaveBeenCalled();
    });

  it.each(["v3_provider_started", undefined])(
    "retires an expired uncertain claim with marker %s without spending again",
    async (failureReason) => {
    const startedAt = new Date("2026-09-21T00:00:00Z");
    const later = new Date("2026-09-23T00:00:00Z");
    const old = ReaderSummaryJob.rehydrate({ ...workspaceFrozenJob()
      .startPrepared({ startedAt, readyAt: startedAt }).toSnapshot(),
      failureReason });
    const failed = ReaderSummaryJob.rehydrate({ ...old.toSnapshot(),
      status: "failed", failedAt: later,
      failureReason: "V3 execution outcome uncertain after provider invocation" });
    const tx = { $queryRaw: jest.fn(async (parts: TemplateStringsArray) => {
      const statement = parts.join("?");
      if (statement.includes("FROM reader_summary_jobs")) return [{ ...lockedRow(),
        status: "RUNNING", started_at: startedAt,
        failure_reason: failureReason ?? null }];
      if (statement.includes("AS expired")) return [{ expired: true }];
      return [];
    }) };
    const source = unusedSource();
    const outcome = await new PrismaReaderSummaryV3Preflight(prismaFor(tx),
      repositoryReturning(old, failed), source).advance({ job: old,
        requestedAt: later, startedAt: later });
    expect(outcome).toMatchObject({ kind: "terminal", job: failed });
    expect(tx.$queryRaw.mock.calls.some(([parts]) => (parts as TemplateStringsArray)
      .join("?").includes("status='RUNNING',"))).toBe(false);
    expect(source.prepare).not.toHaveBeenCalled();
  });

  it("does not reclaim a historical failed quota marker", async () => {
    const failed = workspaceFrozenJob().startPrepared({ startedAt: now,
      readyAt: now }).fail({ failedAt: now,
      failureReason: "v3_retryable_provider_rate_limited" });
    const tx = { $queryRaw: jest.fn() };
    const source = unusedSource();
    const outcome = await new PrismaReaderSummaryV3Preflight(prismaFor(tx),
      repositoryReturning(failed, failed), source).advance({ job: failed,
        requestedAt: now, startedAt: now });
    expect(outcome).toMatchObject({ kind: "terminal", job: failed });
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(source.prepare).not.toHaveBeenCalled();
  });

  it("retires an expired claim when frozen preparation no longer verifies", async () => {
    const startedAt = new Date("2026-09-21T00:00:00Z");
    const later = new Date("2026-09-23T00:00:00Z");
    const old = ReaderSummaryJob.rehydrate({ ...workspaceFrozenJob("weekly")
      .startPrepared({ startedAt, readyAt: startedAt }).toSnapshot(),
      failureReason: "v3_pre_provider_claim" });
    const failed = ReaderSummaryJob.rehydrate({ ...old.toSnapshot(),
      status: "failed", failedAt: later,
      failureReason: "V3 recovery requires manual review: frozen preparation is unverifiable" });
    const sql: string[] = [];
    const tx = { $queryRaw: jest.fn(async (parts: TemplateStringsArray) => {
      const statement = parts.join("?");
      sql.push(statement);
      if (statement.includes("FROM reader_summary_jobs")) return [{ ...lockedRow(),
        status: "RUNNING", started_at: startedAt,
        failure_reason: "v3_pre_provider_claim",
        preparation_manifest_sha256: "0".repeat(64) }];
      if (statement.includes("AS expired")) return [{ expired: true }];
      return [];
    }) };

    const outcome = await new PrismaReaderSummaryV3Preflight(prismaFor(tx),
      repositoryReturning(old, failed), unusedSource()).advance({ job: old,
        requestedAt: later, startedAt: later });

    expect(outcome).toMatchObject({ kind: "terminal", job: failed });
    expect(sql.some((statement) => statement.includes(
      "frozen preparation is unverifiable"))).toBe(true);
    expect(sql.some((statement) => statement.includes(
      "failure_reason='v3_recovery_claim'"))).toBe(false);
  });

  // Regression: a JSONB manifest, per-interest rubric, period, or exact
  // cutoff changed after freeze cannot pass on matching assessment ids alone.
  it.each(["digest", "period", "config", "cutoff"] as const)(
    "fails a workspace ready claim with a changed frozen %s", async (change) => {
    const requested = workspaceFrozenJob();
    const failed = requested.failPreparation({ failedAt: now,
      failureReason: "config_unavailable", terminalFailureCode: "config_unavailable" });
    const sql: string[] = [];
    const row = { ...lockedRow(), preparation_config: change === "config"
      ? { ...workspaceConfig, interests: [{ ...config,
        rubricSha256: "0".repeat(64) }] } : workspaceConfig,
      preparation_manifest: workspaceManifest,
      preparation_manifest_sha256: change === "digest" ? "0".repeat(64) :
        readerSummaryWorkspaceManifestSha256(workspaceManifest),
      preparation_cutoff_at: change === "cutoff"
        ? "2026-09-20T23:59:59.999999Z" : workspaceManifest.cutoffAt,
      period_key: change === "period" ? "daily:another-window" :
        workspaceManifest.periodKey };
    const tx = { $queryRaw: jest.fn(async (parts: TemplateStringsArray) => {
      const text = parts.join("?");
      sql.push(text);
      if (text.includes("FROM reader_summary_jobs")) return [row];
      return [];
    }) };

    await expect(new PrismaReaderSummaryV3Preflight(prismaFor(tx),
      repositoryReturning(requested, failed), unusedSource())
      .advance({ job: requested, requestedAt: now, startedAt: now }))
      .resolves.toMatchObject({ kind: "terminal", job: failed });
    expect(sql.some((value) => value.includes("FROM interests"))).toBe(false);
  });

  // Regression: a frozen interest V1 config from another interest must not
  // claim this job's scope, even when its no-candidate manifest is covered.
  it("rejects an interest V1 config bound to another job interest", async () => {
    const requested = frozenJob();
    const failed = requested.failPreparation({ failedAt: now,
      failureReason: "config_unavailable", terminalFailureCode: "config_unavailable" });
    const sql: string[] = [];
    const tx = { $queryRaw: jest.fn(async (parts: TemplateStringsArray) => {
      const text = parts.join("?");
      sql.push(text);
      if (text.includes("FROM reader_summary_jobs")) {
        return [{ ...lockedRow(), preparation_config: { ...config,
          interestId: id(5) } }];
      }
      if (text.includes("FROM workspaces")) return [{ live: true }];
      return [];
    }) };

    await expect(new PrismaReaderSummaryV3Preflight(prismaFor(tx),
      repositoryReturning(requested, failed), unusedSource())
      .advance({ job: requested, requestedAt: now, startedAt: now }))
      .resolves.toMatchObject({ kind: "terminal", job: failed });
    expect(sql.some((value) => value.includes("FROM interests"))).toBe(false);
  });

  it.each([
    ["2026-09-21T00:15:00.123400Z", true, "claimed"],
    ["2026-09-21T00:15:00.123457Z", false, "terminal"],
  ] as const)("uses the six-digit DB deadline for assessment accepted at %s",
    async (_assessedAt, acceptedOnTime, expectedKind) => {
      const requested = frozenJob(true);
      const current = acceptedOnTime
        ? requested.startPrepared({ startedAt: now, readyAt: now })
        : requested.failPreparation({ failedAt: now,
            failureReason: "assessment_coverage_timeout",
            terminalFailureCode: "assessment_coverage_timeout" });
      const boundValues: unknown[] = [];
      const tx = { $queryRaw: jest.fn(async (parts: TemplateStringsArray,
        ...values: readonly unknown[]) => {
        const text = parts.join("?");
        boundValues.push(...values);
        if (text.includes("FROM reader_summary_jobs")) return [lockedRow()];
        if (text.includes("FROM workspaces")) return [{ live: true }];
        if (text.includes("FROM interests")) {
          return [{ id: id(4), query: interestQuery }];
        }
        if (text.includes("FROM feed_items")) return [{ id: candidate.candidateId,
          interest_id: id(4), source_item_id: candidate.sourceItemId,
          source_binding_id: candidate.sourceBindingId,
          provider_key: candidate.providerKey }];
        if (text.includes("FROM reader_value_assessments")) return [{
          id: candidate.assessmentId, state: "assessed", accepted_on_time: acceptedOnTime,
          source_snapshot_sha256: candidate.sourceSnapshotSha256,
          input_sha256: candidate.inputSha256,
          rubric_sha256: config.rubricSha256,
          model_config_version: config.modelConfigVersion,
        }];
        if (text.includes("UPDATE reader_summary_jobs SET status='RUNNING'")) {
          return [{ started_at: now }];
        }
        if (text.includes("SELECT clock_timestamp()")) return [{ expired: true }];
        return [];
      }) };
      const prisma = { ...tx, $transaction: async (operation: (client: typeof tx) =>
        Promise<unknown>) => operation(tx) } as unknown as PrismaSummaryClient;
      const jobs = { findById: jest.fn()
        .mockResolvedValueOnce(requested).mockResolvedValueOnce(current) } as unknown as
        PrismaReaderSummaryJobRepository;

      await expect(new PrismaReaderSummaryV3Preflight(prisma, jobs, unusedSource())
        .advance({ job: requested, requestedAt: now, startedAt: now }))
        .resolves.toMatchObject({ kind: expectedKind });
      expect(boundValues).toContain("2026-09-21T00:15:00.123456Z");
    });

  // Regression: a corrupt assessed JSON result must fail the durable ready
  // claim before the job starts or a no-signal artifact can be generated.
  it("rejects malformed workspace answers in the Prisma ready claim", async () => {
    const manifest = { ...workspaceManifest,
      candidates: [{ ...candidate, interestId: config.interestId,
        publishedAt: "2026-09-19T12:00:00.123456Z",
        observedAt: "2026-09-19T12:00:01.123456Z" }] };
    const requested = ReaderSummaryJob.rehydrate({
      ...requestedJob().toSnapshot(), scope: { type: "workspace" } })
      .freezePreparation({ strategy: "jev_primary_v3", config: workspaceConfig,
        cutoffAt: manifest.cutoffAt,
        deadlineAt: "2026-09-21T00:15:00.000000Z",
        nextCheckAt: new Date("2026-09-21T00:00:10Z") })
      .freezePreparationManifest({ manifest,
        manifestSha256: readerSummaryWorkspaceManifestSha256(manifest) });
    const failed = requested.failPreparation({ failedAt: now,
      failureReason: "assessment_unavailable",
      terminalFailureCode: "assessment_unavailable" });
    const sql: string[] = [];
    const tx = { $queryRaw: jest.fn(async (parts: TemplateStringsArray) => {
      const text = parts.join("?");
      sql.push(text);
      if (text.includes("FROM reader_summary_jobs")) return [{ ...lockedRow(),
        preparation_config: workspaceConfig, preparation_manifest: manifest,
        preparation_manifest_sha256: readerSummaryWorkspaceManifestSha256(manifest),
        period_key: manifest.periodKey }];
      if (text.includes("FROM workspaces")) return [{ live: true }];
      if (text.includes("FROM interests")) return [{ id: config.interestId,
        query: interestQuery }];
      if (text.includes("FROM feed_items")) return [{ id: candidate.candidateId,
        interest_id: config.interestId, source_item_id: candidate.sourceItemId,
        source_binding_id: candidate.sourceBindingId,
        provider_key: candidate.providerKey }];
      if (text.includes("FROM reader_value_assessments")) return [{
        id: candidate.assessmentId, interest_id: config.interestId,
        source_item_id: candidate.sourceItemId,
        source_revision_key: candidate.sourceRevisionKey, state: "assessed",
        accepted_on_time: true,
        source_snapshot_sha256: candidate.sourceSnapshotSha256,
        input_sha256: candidate.inputSha256,
        interest_sha256: config.interestSha256,
        rubric_version: config.rubricVersion,
        rubric_sha256: config.rubricSha256,
        input_builder_version: config.inputBuilderVersion,
        model_config_version: config.modelConfigVersion,
        result: { usefulness: { choice: "noise" } } }];
      return [];
    }) };
    const outcome = await new PrismaReaderSummaryV3Preflight(prismaFor(tx),
      repositoryReturning(requested, failed), unusedSource())
      .advance({ job: requested, requestedAt: now, startedAt: now });

    expect(outcome).toMatchObject({ kind: "terminal", job: failed });
    expect(sql.find((text) => text.includes("FROM reader_value_assessments")))
      .toContain("a.result");
    expect(sql.some((text) => text.includes(
      "UPDATE reader_summary_jobs SET status='RUNNING'"))).toBe(false);
  });
});

type ConfigurationMethod = ReaderSummaryV3PreparationSourcePort["configuration"];

type LockedRow = {
  readonly status: string;
  readonly selection_strategy: string | null;
  readonly preparation_manifest: unknown | null;
  readonly preparation_config: unknown | null;
  readonly preparation_manifest_sha256: string | null;
  readonly period_key: string;
  readonly preparation_cutoff_at: string | null;
  readonly preparation_deadline_at: string | null;
  readonly started_at: Date | null;
  readonly preparation_next_check_at?: Date | null;
  readonly terminal_failure_code: string | null;
};

const requestedJob = () => ReaderSummaryJob.request({ id: id(1),
  tenantId: tenantId(id(2)), workspaceId: workspaceId(id(3)),
  scope: { type: "interest", interestId: id(4) },
  period: { cadence: "daily", startedAt: new Date("2026-09-19T00:00:00Z"),
    endedAt: new Date("2026-09-20T00:00:00Z"), timezone: "UTC",
    periodKey: "daily:2026-09-19T00:00:00.000Z:2026-09-20T00:00:00.000Z:UTC" },
  idempotencyKey: "v3-fence", requestedAt: now,
  selectionStrategy: "jev_primary_v3" });

const configuredJob = () => requestedJob().freezePreparation({
    strategy: "jev_primary_v3", config, cutoffAt: "2026-09-21T00:00:00.000000Z",
    deadlineAt: "2026-09-21T00:15:00.000000Z",
    nextCheckAt: new Date("2026-09-21T00:00:10Z") });

const frozenJob = (withCandidate = false) => configuredJob().freezePreparationManifest({
    manifest: { schemaVersion: "reader_summary_preparation_manifest.v1",
      cutoffAt: "2026-09-21T00:00:00.000000Z",
      interestSha256: config.interestSha256, rubricSha256: config.rubricSha256,
      inputBuilderVersion: config.inputBuilderVersion,
      modelConfigVersion: config.modelConfigVersion,
      candidates: withCandidate ? [candidate] : [] },
    manifestSha256: "4".repeat(64) });

const preparation = () => ({ ok: true as const, config,
  manifest: frozenJob().toSnapshot().preparationManifest!,
  manifestSha256: "4".repeat(64) });

const transactionReturning = (row: LockedRow) => ({
  $queryRaw: jest.fn(async (parts: TemplateStringsArray) =>
    parts.join("?").includes("FROM reader_summary_jobs") ? [row] : []),
});

const readyClaimTransaction = (startedAt: Date) => ({
  $queryRaw: jest.fn(async (parts: TemplateStringsArray) => {
    const text = parts.join("?");
    if (text.includes("FROM reader_summary_jobs")) return [lockedRow()];
    if (text.includes("FROM workspaces")) return [{ live: true }];
    if (text.includes("FROM interests")) {
      return [{ id: id(4), query: interestQuery }];
    }
    if (text.includes("UPDATE reader_summary_jobs SET status='RUNNING'")) {
      return [{ started_at: startedAt }];
    }
    return [];
  }),
});

const prismaFor = (tx: { readonly $queryRaw: jest.Mock }) => ({ ...tx,
  $transaction: async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx),
}) as unknown as PrismaSummaryClient;

const repositoryReturning = (...jobs: readonly ReaderSummaryJob[]) => ({
  findById: jest.fn().mockResolvedValueOnce(jobs[0]).mockResolvedValueOnce(jobs[1]),
}) as unknown as PrismaReaderSummaryJobRepository;

const lockedRow = (): LockedRow => ({ status: "REQUESTED",
  selection_strategy: "jev_primary_v3",
  preparation_manifest: {}, preparation_config: config,
  preparation_manifest_sha256: "4".repeat(64),
  period_key: requestedJob().toSnapshot().period.periodKey,
  preparation_cutoff_at: "2026-09-21T00:00:00.000000Z",
  preparation_deadline_at: "2026-09-21T00:15:00.123456Z",
  started_at: null, terminal_failure_code: null });
const unusedSource = (): ReaderSummaryV3PreparationSourcePort => ({
  configuration: jest.fn(), prepare: jest.fn(), coverage: jest.fn(),
});
const id = (ordinal: number) =>
  `00000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`;
const interestQuery = "database methods";
const config = { schemaVersion: "reader_summary_preparation_config.v1" as const,
  interestId: id(4), interestSha256: createHash("sha256").update(interestQuery).digest("hex"),
  rubricVersion: "reader-value.v1", rubricSha256: "3".repeat(64),
  inputBuilderVersion: "input.v1", modelConfigVersion: "jev.v1" };
const workspaceConfig = { schemaVersion: "reader_summary_preparation_config.v2" as const,
  interests: [config] };
const workspaceManifest = { schemaVersion: "reader_summary_preparation_manifest.v2" as const,
  cutoffAt: "2026-09-21T00:00:00.000000Z",
  periodKey: "daily:2026-09-19T00:00:00.000Z:2026-09-20T00:00:00.000Z:UTC",
  interests: [config], candidates: [] };
const workspaceFrozenJob = (cadence: "daily" | "weekly" = "daily") => {
  const original = requestedJob().toSnapshot();
  const startedAt = cadence === "weekly" ? new Date("2026-09-13T00:00:00Z") :
    original.period.startedAt;
  const period = { ...original.period, cadence, startedAt,
    periodKey: `${cadence}:${startedAt.toISOString()}:` +
      `${original.period.endedAt.toISOString()}:UTC` };
  const manifest = { ...workspaceManifest, periodKey: period.periodKey };
  return ReaderSummaryJob.rehydrate({
  ...original, scope: { type: "workspace" }, period }).freezePreparation({
    strategy: "jev_primary_v3", config: workspaceConfig,
    cutoffAt: manifest.cutoffAt,
    deadlineAt: "2026-09-21T00:15:00.000000Z",
    nextCheckAt: new Date("2026-09-21T00:00:10Z"),
  }).freezePreparationManifest({ manifest,
    manifestSha256: readerSummaryWorkspaceManifestSha256(manifest) });
};
const candidate = { candidateId: id(10), sourceItemId: id(11),
  sourceBindingId: id(12), providerKey: "rss", sourceRevisionKey: "revision",
  sourceSnapshotSha256: "1".repeat(64), assessmentId: id(13),
  inputSha256: "2".repeat(64), publishedAt: "2026-09-20T12:00:00.123456Z",
  observedAt: "2026-09-20T12:00:01.123456Z", sourceKind: "article",
  canonicalIdentity: "https://example.test/item" };
const databaseClockText = "2026-09-21T00:00:00.123456+00:00";
const now = new Date(databaseClockText);
