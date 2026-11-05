import type {
  ReaderSummaryV3PreflightOutcome,
  ReaderSummaryV3PreflightPort,
  ReaderSummaryV3PreparationSourcePort,
} from "../../ports";
import type { InMemoryReaderSummaryJobRepository } from
  "./in-memory-reader-summary-job.repository";
import { canonicalReaderSummaryPreparationTimestamp,
  ReaderSummaryJob, readerSummaryWorkspaceManifestSha256,
  sameReaderSummaryPreparationIdentity } from "../../domain";
import { ReaderSummaryExecutionLeasePolicy } from
  "../../features/execute-reader-summary-job/reader-summary-execution-lease.policy";

const deadlineMs = 15 * 60 * 1_000;
const checkMs = 10 * 1_000;
const preProviderClaim = "v3_pre_provider_claim";
const providerStarted = "v3_provider_started";
const uncertainOutcome = "V3 execution outcome uncertain after provider invocation";

export class InMemoryReaderSummaryV3Preflight
implements ReaderSummaryV3PreflightPort {
  constructor(
    private readonly jobs: InMemoryReaderSummaryJobRepository,
    private readonly source: ReaderSummaryV3PreparationSourcePort,
    private readonly lease: ReaderSummaryExecutionLeasePolicy =
      new ReaderSummaryExecutionLeasePolicy(),
  ) {}

  async markProviderStarted(job: ReaderSummaryJob, expectedStartedAt: Date): Promise<boolean> {
    return this.jobs.runExclusive(async () => {
      const current = await this.find(job);
      const snapshot = current?.toSnapshot();
      if (snapshot?.status !== "running" ||
          snapshot.startedAt?.getTime() !== expectedStartedAt.getTime() ||
          snapshot.failureReason !== preProviderClaim) return false;
      await this.jobs.save(ReaderSummaryJob.rehydrate({ ...snapshot,
        failureReason: providerStarted }));
      return true;
    });
  }

  async advance(
    params: Parameters<ReaderSummaryV3PreflightPort["advance"]>[0],
  ): Promise<ReaderSummaryV3PreflightOutcome> {
    let job = (await this.find(params.job)) ?? params.job;
    let snapshot = job.toSnapshot();
    if (snapshot.status === "running") {
      return this.recover(job, params.startedAt);
    }
    if (snapshot.status !== "requested") return { kind: "terminal", job };

    if (snapshot.preparationConfig === undefined) {
      const configured = await this.source.configuration(job);
      if (!configured.ok) {
        return this.fail(job, params.startedAt, configured.code, true);
      }
      const cutoff = snapshot.preparationCutoffAt ??
        canonicalReaderSummaryPreparationTimestamp(snapshot.requestedAt);
      const deadline = snapshot.preparationDeadlineAt ??
        canonicalReaderSummaryPreparationTimestamp(
          new Date(params.startedAt.getTime() + deadlineMs),
        );
      const frozen = job.freezePreparation({
        strategy: "jev_primary_v3",
        config: configured.config,
        cutoffAt: cutoff,
        deadlineAt: deadline,
        nextCheckAt: new Date(Math.min(Date.parse(deadline),
          params.startedAt.getTime() + checkMs)),
      });
      await this.jobs.runExclusive(async () => {
        const current = await this.find(job);
        const currentSnapshot = current?.toSnapshot();
        if (currentSnapshot?.status !== "requested") return;
        await this.jobs.save(currentSnapshot.preparationConfig === undefined ? frozen : current!);
      });
      job = (await this.find(job)) ?? job;
      snapshot = job.toSnapshot();
      if (snapshot.status === "running") return { kind: "already_running", job };
      if (snapshot.status !== "requested") return { kind: "terminal", job };
    }
    if (snapshot.preparationManifest === undefined) {
      const config = snapshot.preparationConfig;
      if (config === undefined) return this.fail(job, params.startedAt, "config_unavailable");
      const prepared = await this.source.prepare(job, config);
      if (!prepared.ok) return this.fail(job, params.startedAt, prepared.code);
      if (!sameReaderSummaryPreparationIdentity(config, prepared.config,
        prepared.manifest) ||
          prepared.manifest.schemaVersion ===
            "reader_summary_preparation_manifest.v2" &&
          prepared.manifest.cutoffAt !== snapshot.preparationCutoffAt) {
        return this.fail(job, params.startedAt, "config_unavailable");
      }
      const withManifest = job.freezePreparationManifest({ manifest: prepared.manifest,
        manifestSha256: prepared.manifestSha256 });
      await this.jobs.runExclusive(async () => {
        const current = await this.find(job);
        const currentSnapshot = current?.toSnapshot();
        if (currentSnapshot?.status !== "requested" ||
            currentSnapshot.preparationManifest !== undefined) return;
        await this.jobs.save(withManifest);
      });
      job = (await this.find(job)) ?? job;
      snapshot = job.toSnapshot();
      if (snapshot.status === "running") return { kind: "already_running", job };
      if (snapshot.status !== "requested") return { kind: "terminal", job };
    }
    const manifest = snapshot.preparationManifest;
    const deadline = snapshot.preparationDeadlineAt;
    if (manifest === undefined || deadline === undefined) {
      return this.fail(job, params.startedAt, "config_unavailable");
    }
    const coverage = await this.source.coverage({ job, manifest, deadlineAt: deadline });
    return this.jobs.runExclusive(async () => {
      const current = await this.find(job);
      if (current === null) return { kind: "terminal", job };
      const currentSnapshot = current.toSnapshot();
      if (currentSnapshot.status === "running") return { kind: "already_running", job: current };
      if (currentSnapshot.status !== "requested") return { kind: "terminal", job: current };
      if (coverage.status === "ready") {
        const running = ReaderSummaryJob.rehydrate({
          ...current.startPrepared({ startedAt: params.startedAt,
            readyAt: params.startedAt }).toSnapshot(),
          failureReason: preProviderClaim });
        await this.jobs.save(running);
        return { kind: "claimed", job: running, manifest };
      }
      if (coverage.status === "unavailable") {
        const failed = current.failPreparation({ failedAt: params.startedAt,
          failureReason: coverage.code, terminalFailureCode: coverage.code });
        await this.jobs.save(failed);
        return { kind: "terminal", job: failed };
      }
      if (params.startedAt.getTime() >= Date.parse(deadline)) {
        const failed = current.failPreparation({ failedAt: params.startedAt,
          failureReason: "assessment_coverage_timeout",
          terminalFailureCode: "assessment_coverage_timeout" });
        await this.jobs.save(failed);
        return { kind: "terminal", job: failed };
      }
      const deferred = current.deferPreparation(new Date(Math.min(Date.parse(deadline),
        params.startedAt.getTime() + checkMs)));
      await this.jobs.save(deferred);
      return { kind: "deferred", job: deferred };
    });
  }

  private async recover(job: ReaderSummaryJob, now: Date):
  Promise<ReaderSummaryV3PreflightOutcome> {
    return this.jobs.runExclusive(async () => {
      const current = await this.find(job);
      if (current === null) return { kind: "terminal", job };
      const snapshot = current.toSnapshot();
      if (snapshot.status === "running") {
        if (snapshot.startedAt === undefined ||
            snapshot.startedAt >= this.lease.staleRunningStartedBefore(now)) {
          return { kind: "already_running", job: current };
        }
        if (snapshot.failureReason !== preProviderClaim) {
          const failed = ReaderSummaryJob.rehydrate({ ...snapshot, status: "failed",
            failedAt: now, failureReason: uncertainOutcome });
          await this.jobs.save(failed);
          return { kind: "terminal", job: failed };
        }
      } else return { kind: "terminal", job: current };
      const manifest = snapshot.preparationManifest;
      const config = snapshot.preparationConfig;
      if (manifest === undefined || config === undefined ||
          !sameReaderSummaryPreparationIdentity(config, config, manifest) ||
          manifest.schemaVersion === "reader_summary_preparation_manifest.v2" &&
          (readerSummaryWorkspaceManifestSha256(manifest) !==
            snapshot.preparationManifestSha256 ||
            manifest.cutoffAt !== snapshot.preparationCutoffAt ||
            manifest.periodKey !== snapshot.period.periodKey)) {
        const failed = ReaderSummaryJob.rehydrate({ ...snapshot, status: "failed",
          failedAt: now,
          failureReason: "V3 recovery requires manual review: frozen preparation is unverifiable" });
        await this.jobs.save(failed);
        return { kind: "terminal", job: failed };
      }
      const startedAt = new Date(Math.max(now.getTime(),
        (snapshot.startedAt?.getTime() ?? 0) + 1));
      const running = ReaderSummaryJob.rehydrate({ ...snapshot, status: "running",
        requestedAt: snapshot.requestedAt, startedAt, failedAt: undefined,
        preparationNextCheckAt: undefined, failureReason: preProviderClaim });
      await this.jobs.save(running);
      return { kind: "claimed", job: running, manifest };
    });
  }

  private async fail(
    job: Parameters<ReaderSummaryV3PreparationSourcePort["prepare"]>[0],
    now: Date,
    code: "assessment_snapshot_unavailable" |
      "assessment_inventory_over_budget" | "assessment_time_over_budget" |
      "config_unavailable",
    unconfiguredOnly = false,
  ): Promise<ReaderSummaryV3PreflightOutcome> {
    return this.jobs.runExclusive(async () => {
      const current = await this.find(job);
      if (current === null) return { kind: "terminal", job };
      const currentSnapshot = current.toSnapshot();
      if (currentSnapshot.status === "running") {
        return { kind: "already_running", job: current };
      }
      if (currentSnapshot.status === "requested" &&
          (currentSnapshot.preparationManifest !== undefined ||
            (unconfiguredOnly && currentSnapshot.preparationConfig !== undefined))) {
        return { kind: "deferred", job: current };
      }
      if (currentSnapshot.status !== "requested") {
        return { kind: "terminal", job: current };
      }
      const failed = current.failPreparation({ failedAt: now,
        failureReason: code, terminalFailureCode: code });
      await this.jobs.save(failed);
      return { kind: "terminal", job: failed };
    });
  }

  private find(job: Parameters<ReaderSummaryV3PreparationSourcePort["prepare"]>[0]) {
    const snapshot = job.toSnapshot();
    return this.jobs.findById({ tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId, readerSummaryJobId: snapshot.id });
  }
}
