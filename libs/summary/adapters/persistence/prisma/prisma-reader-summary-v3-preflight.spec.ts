import { createHash } from "node:crypto";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryJob } from "../../../domain";
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
      configuration: jest.fn(async () => ({ ok: true, config })),
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
      configuration: jest.fn(async () => ({ ok: false,
        code: "config_unavailable" as const })),
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
      configuration: jest.fn(async () => ({ ok: false,
        code: "config_unavailable" as const })),
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
        return [{ query: interestQuery, status: "ENABLED", deleted_at: null }];
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
    const transaction = jest.fn();
    const prisma = { $transaction: transaction } as unknown as PrismaSummaryClient;
    const jobs = { findById: jest.fn().mockResolvedValue(running) } as unknown as
      PrismaReaderSummaryJobRepository;

    await expect(new PrismaReaderSummaryV3Preflight(prisma, jobs, unusedSource())
      .advance({ job: running, requestedAt: now, startedAt: now }))
      .resolves.toMatchObject({ kind: "already_running" });
    expect(transaction).not.toHaveBeenCalled();
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
          return [{ query: interestQuery, status: "ENABLED", deleted_at: null }];
        }
        if (text.includes("FROM feed_items")) return [{ id: candidate.candidateId }];
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
});

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

const transactionReturning = (row: ReturnType<typeof lockedRow>) => ({
  $queryRaw: jest.fn(async (parts: TemplateStringsArray) =>
    parts.join("?").includes("FROM reader_summary_jobs") ? [row] : []),
});

const readyClaimTransaction = (startedAt: Date) => ({
  $queryRaw: jest.fn(async (parts: TemplateStringsArray) => {
    const text = parts.join("?");
    if (text.includes("FROM reader_summary_jobs")) return [lockedRow()];
    if (text.includes("FROM workspaces")) return [{ live: true }];
    if (text.includes("FROM interests")) {
      return [{ query: interestQuery, status: "ENABLED", deleted_at: null }];
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

const lockedRow = () => ({ status: "REQUESTED", selection_strategy: "jev_primary_v3",
  preparation_manifest: {}, preparation_config: config,
  preparation_manifest_sha256: "4".repeat(64),
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
const candidate = { candidateId: id(10), sourceItemId: id(11),
  sourceBindingId: id(12), providerKey: "rss", sourceRevisionKey: "revision",
  sourceSnapshotSha256: "1".repeat(64), assessmentId: id(13),
  inputSha256: "2".repeat(64), publishedAt: "2026-09-20T12:00:00.123456Z",
  observedAt: "2026-09-20T12:00:01.123456Z", sourceKind: "article",
  canonicalIdentity: "https://example.test/item" };
const databaseClockText = "2026-09-21T00:00:00.123456+00:00";
const now = new Date(databaseClockText);
