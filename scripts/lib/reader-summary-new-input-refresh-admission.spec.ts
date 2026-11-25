import { FixedClock, tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { ReaderSummaryJob } from "@social-monitor/summary/domain";
import { RequestReaderSummaryUseCase } from "@social-monitor/summary/features/request-reader-summary/request-reader-summary.use-case";
import { FakeReaderSummaryJobRepository } from "@social-monitor/summary/features/execute-reader-summary-job/execute-reader-summary-job.spec-support";
import { createRefreshAdmission } from "./reader-summary-new-input-refresh-admission";
import { refreshPeriod } from "./reader-summary-new-input-refresh-capture";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";

it("canonical admission gives terminal NO_SIGNAL a distinct job, then replays without a second grant", async () => {
  const m = refreshManifest();
  const scope = { tenantId: tenantId(m.tenantId), workspaceId: workspaceId(m.workspaceId) };
  const jobs = new FakeReaderSummaryJobRepository();
  const old = ReaderSummaryJob.request({ ...scope, id: m.prior.jobId, scope: { type: "workspace" },
    period: refreshPeriod(m.date), idempotencyKey: "old-canonical-request", requestedAt: refreshNow })
    .start({ startedAt: refreshNow }).markNoSignal({ completedAt: refreshNow, readerSummaryId: m.prior.artifactId });
  await jobs.save(old);
  const check = jest.fn(async () => undefined);
  const admission = createRefreshAdmission(m, { assertCurrent: check });
  const request = new RequestReaderSummaryUseCase(jobs, admission.queue, admission.quota,
    { generate: () => "refresh-job" }, new FixedClock(refreshNow));
  const command = { ...scope, scope: { type: "workspace" as const }, cadence: "daily" as const,
    period: refreshPeriod(m.date), idempotencyKey: m.operation, correlationId: m.operation };
  expect(await request.execute(command)).toMatchObject({ ok: true, value: { created: true, readerSummaryJobId: "refresh-job" } });
  expect(await request.execute(command)).toMatchObject({ ok: true, value: { created: false, readerSummaryJobId: "refresh-job" } });
  expect(check).toHaveBeenCalledTimes(2);
  expect(await jobs.findById({ ...scope, readerSummaryJobId: old.toSnapshot().id })).toEqual(old);
  expect(await request.execute({ ...command, idempotencyKey: "new-path" })).toMatchObject({ ok: false });
});
it("operator grant rejects wrong scope, operation, ID and reused reservations", async () => {
  const m = refreshManifest();
  const check = jest.fn(async () => undefined);
  const { queue, quota } = createRefreshAdmission(m, { assertCurrent: check });
  const command = { tenantId: tenantId(m.tenantId), workspaceId: workspaceId(m.workspaceId),
    readerSummaryJobId: "new-job", causationId: m.operation, correlationId: m.operation };
  expect(await queue.canAccept({ ...command, tenantId: tenantId("wrong") })).toBe(false);
  expect(await queue.canAccept({ ...command, causationId: "wrong" })).toBe(false);
  const reserve = { tenantId: command.tenantId, workspaceId: command.workspaceId, scopeKey: "workspace", operation: "reader_summary.request" as const };
  expect(await quota.reserveSummaryJob(reserve)).toMatchObject({ ok: false });
  expect(await queue.canAccept(command)).toBe(true);
  expect(await quota.reserveSummaryJob({ ...reserve, scopeKey: "interest:other" })).toMatchObject({ ok: false });
  expect(await quota.reserveSummaryJob(reserve)).toMatchObject({ ok: true, value: { remaining: 0 } });
  expect(await quota.reserveSummaryJob(reserve)).toMatchObject({ ok: false });
  await expect(queue.enqueue({ ...command, readerSummaryJobId: "other" })).rejects.toThrow(/mismatch/);
  await queue.enqueue(command);
  await expect(queue.enqueue(command)).rejects.toThrow(/mismatch/);
});
it("checks current durable budget and authority immediately before reservation", async () => {
  const m = refreshManifest();
  const grant = createRefreshAdmission(m, { assertCurrent: async () => { throw new Error("consumed"); } });
  await expect(grant.queue.canAccept({ tenantId: tenantId(m.tenantId), workspaceId: workspaceId(m.workspaceId),
    readerSummaryJobId: "new", causationId: m.operation, correlationId: m.operation })).rejects.toThrow(/consumed/);
});
