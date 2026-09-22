import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryJob, type ReaderSummaryPreparationManifest } from "../../domain";
import type { ReaderSummaryV3PreparationSourcePort } from "../../ports";
import { InMemoryReaderSummaryJobRepository } from
  "./in-memory-reader-summary-job.repository";
import { InMemoryReaderSummaryV3Preflight } from
  "./in-memory-reader-summary-v3-preflight";

describe("InMemoryReaderSummaryV3Preflight", () => {
  it("returns already_running when a peer claims during configuration refresh", async () => {
    const jobs = new InMemoryReaderSummaryJobRepository();
    const requested = requestedJob();
    const running = runningJob();
    await jobs.save(requested);
    const source: ReaderSummaryV3PreparationSourcePort = {
      configuration: jest.fn(async () => {
        await jobs.save(running);
        return { ok: true, config: fixture(1).config };
      }),
      prepare: jest.fn(), coverage: jest.fn(),
    };

    await expect(new InMemoryReaderSummaryV3Preflight(jobs, source)
      .advance(command(requested, 0)))
      .resolves.toMatchObject({ kind: "already_running", job: running });
    expect(source.prepare).not.toHaveBeenCalled();
  });

  it("returns already_running when a peer claims during manifest refresh", async () => {
    const jobs = new InMemoryReaderSummaryJobRepository();
    const requested = configuredJob();
    const running = runningJob();
    await jobs.save(requested);
    const source: ReaderSummaryV3PreparationSourcePort = {
      configuration: jest.fn(),
      prepare: jest.fn(async () => {
        await jobs.save(running);
        return fixture(1);
      }),
      coverage: jest.fn(),
    };

    await expect(new InMemoryReaderSummaryV3Preflight(jobs, source)
      .advance(command(requested, 0)))
      .resolves.toMatchObject({ kind: "already_running", job: running });
  });

  it("returns already_running when a peer claims while a source failure is handled", async () => {
    const jobs = new InMemoryReaderSummaryJobRepository();
    const requested = requestedJob();
    const running = runningJob();
    await jobs.save(requested);
    const source: ReaderSummaryV3PreparationSourcePort = {
      configuration: jest.fn(async () => {
        await jobs.save(running);
        return { ok: false, code: "config_unavailable" as const };
      }),
      prepare: jest.fn(), coverage: jest.fn(),
    };

    await expect(new InMemoryReaderSummaryV3Preflight(jobs, source)
      .advance(command(requested, 0)))
      .resolves.toMatchObject({ kind: "already_running", job: running });
  });

  it("keeps an actual source failure terminal", async () => {
    const jobs = new InMemoryReaderSummaryJobRepository();
    const requested = requestedJob();
    await jobs.save(requested);
    const source: ReaderSummaryV3PreparationSourcePort = {
      configuration: jest.fn(async () => ({ ok: false,
        code: "config_unavailable" as const })),
      prepare: jest.fn(), coverage: jest.fn(),
    };

    const result = await new InMemoryReaderSummaryV3Preflight(jobs, source)
      .advance(command(requested, 0));

    expect(result.kind).toBe("terminal");
    expect(result.job.toSnapshot()).toMatchObject({ status: "failed",
      terminalFailureCode: "config_unavailable" });
  });

  it("freezes one winner and atomically permits only one competing claim", async () => {
    const jobs = new InMemoryReaderSummaryJobRepository();
    const job = requestedJob();
    await jobs.save(job);
    let prepared = 0;
    const source = preparationSource(() => {
      prepared += 1;
      return fixture(prepared);
    }, { status: "ready" });
    const subject = new InMemoryReaderSummaryV3Preflight(jobs, source);

    const outcomes = await Promise.all([subject.advance(command(job, 0)),
      subject.advance(command(job, 1))]);

    expect(outcomes.filter((outcome) => outcome.kind === "claimed")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "already_running"))
      .toHaveLength(1);
    const durable = (await jobs.findById(key(job)))!.toSnapshot();
    expect(durable.status).toBe("running");
    expect(durable.preparationManifestSha256).toBe("1".repeat(64));
    expect(prepared).toBe(2);
  });

  it("checks accepted readiness before an overdue poll and never rebuilds a frozen manifest", async () => {
    const jobs = new InMemoryReaderSummaryJobRepository();
    const job = requestedJob();
    await jobs.save(job);
    let coverage: "pending" | "ready" = "pending";
    let preparations = 0;
    const source = preparationSource(() => {
      preparations += 1;
      return fixture(1);
    }, () => ({ status: coverage }));
    const subject = new InMemoryReaderSummaryV3Preflight(jobs, source);
    const deferred = await subject.advance(command(job, 0));
    expect(deferred.kind).toBe("deferred");
    coverage = "ready";
    const overdue = new Date("2026-09-21T00:16:00.000Z");
    const claimed = await subject.advance({ job: deferred.job,
      requestedAt: job.toSnapshot().requestedAt, startedAt: overdue });
    expect(claimed.kind).toBe("claimed");
    expect(preparations).toBe(1);
    expect(claimed.job.toSnapshot().preparationReadyAt).toEqual(overdue);
  });

  it("fails pending coverage at the frozen deadline without an intermediate running state", async () => {
    const jobs = new InMemoryReaderSummaryJobRepository();
    const job = requestedJob();
    await jobs.save(job);
    const subject = new InMemoryReaderSummaryV3Preflight(jobs,
      preparationSource(() => fixture(1), { status: "pending" }));
    const first = await subject.advance(command(job, 0));
    const deadline = first.job.toSnapshot().preparationDeadlineAt!;
    const terminal = await subject.advance({ job: first.job,
      requestedAt: job.toSnapshot().requestedAt, startedAt: new Date(deadline) });
    expect(terminal.kind).toBe("terminal");
    expect(terminal.job.toSnapshot()).toMatchObject({ status: "failed",
      terminalFailureCode: "assessment_coverage_timeout" });
    expect(terminal.job.toSnapshot().startedAt).toBeUndefined();
    await expect(subject.advance({ job: first.job,
      requestedAt: job.toSnapshot().requestedAt,
      startedAt: new Date(Date.parse(deadline) + 1) })).resolves
      .toMatchObject({ kind: "terminal" });
  });

  it("reuses the exact frozen config after a crash before manifest persistence", async () => {
    const jobs = new InMemoryReaderSummaryJobRepository();
    const job = requestedJob().freezePreparation({ strategy: "jev_primary_v3",
      config: fixture(1).config, cutoffAt: "2026-09-21T00:00:00.000000Z",
      deadlineAt: "2026-09-21T00:15:00.000000Z",
      nextCheckAt: new Date("2026-09-21T00:00:10.000Z") });
    await jobs.save(job);
    const configuration = jest.fn();
    const prepare = jest.fn(async (_job, config) => {
      expect(config).toEqual(fixture(1).config);
      return fixture(1);
    });
    const source: ReaderSummaryV3PreparationSourcePort = { configuration,
      prepare, coverage: async () => ({ status: "pending" }) };

    const result = await new InMemoryReaderSummaryV3Preflight(jobs, source)
      .advance(command(job, 0));

    expect(result.kind).toBe("deferred");
    expect(configuration).not.toHaveBeenCalled();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(result.job.toSnapshot().preparationManifestSha256).toBe("1".repeat(64));
  });
});

const requestedJob = () => ReaderSummaryJob.request({
  id: "00000000-0000-4000-8000-000000000001",
  tenantId: tenantId("00000000-0000-4000-8000-000000000002"),
  workspaceId: workspaceId("00000000-0000-4000-8000-000000000003"),
  scope: { type: "interest", interestId: "00000000-0000-4000-8000-000000000004" },
  period: { cadence: "daily", startedAt: new Date("2026-09-19T00:00:00.000Z"),
    endedAt: new Date("2026-09-20T00:00:00.000Z"), timezone: "UTC",
    periodKey: "daily:2026-09-19T00:00:00.000Z:2026-09-20T00:00:00.000Z:UTC" },
  idempotencyKey: "v3-preflight",
  requestedAt: new Date("2026-09-21T00:00:00.000Z"),
  selectionStrategy: "jev_primary_v3",
});

const configuredJob = () => requestedJob().freezePreparation({
  strategy: "jev_primary_v3", config: fixture(1).config,
  cutoffAt: "2026-09-21T00:00:00.000000Z",
  deadlineAt: "2026-09-21T00:15:00.000000Z",
  nextCheckAt: new Date("2026-09-21T00:00:10.000Z"),
});

const runningJob = () => configuredJob().freezePreparationManifest({
  manifest: fixture(1).manifest, manifestSha256: fixture(1).manifestSha256,
}).startPrepared({ startedAt: command(requestedJob(), 0).startedAt,
  readyAt: command(requestedJob(), 0).startedAt });

const command = (job: ReaderSummaryJob, offset: number) => ({ job,
  requestedAt: job.toSnapshot().requestedAt,
  startedAt: new Date(Date.parse("2026-09-21T00:00:00.000Z") + offset),
});

const key = (job: ReaderSummaryJob) => ({ tenantId: job.toSnapshot().tenantId,
  workspaceId: job.toSnapshot().workspaceId,
  readerSummaryJobId: job.toSnapshot().id });

const fixture = (ordinal: number) => ({ ok: true as const, config: {
  schemaVersion: "reader_summary_preparation_config.v1" as const,
  interestId: "00000000-0000-4000-8000-000000000004",
  interestSha256: "a".repeat(64), rubricVersion: "reader-value.v1",
  rubricSha256: "b".repeat(64), inputBuilderVersion: "input.v1",
  modelConfigVersion: "model.v1",
}, manifest: { schemaVersion: "reader_summary_preparation_manifest.v1" as const,
  cutoffAt: "2026-09-21T00:00:00.000000Z", interestSha256: "a".repeat(64),
  rubricSha256: "b".repeat(64), inputBuilderVersion: "input.v1",
  modelConfigVersion: "model.v1", candidates: [], marker: ordinal,
} as ReaderSummaryPreparationManifest, manifestSha256: `${ordinal}`.repeat(64) });

const preparationSource = (
  prepare: () => ReturnType<typeof fixture>,
  coverage: { readonly status: "ready" | "pending" } |
    (() => { readonly status: "ready" | "pending" }),
): ReaderSummaryV3PreparationSourcePort => ({ prepare: async () => prepare(),
  configuration: async () => ({ ok: true, config: fixture(1).config }),
  coverage: async () => typeof coverage === "function" ? coverage() : coverage });
