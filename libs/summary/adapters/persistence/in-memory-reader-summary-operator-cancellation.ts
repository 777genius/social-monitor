import type { Clock } from "@social-monitor/shared-kernel";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryOperatorCancellationPort } from "../../ports";
import type { InMemoryReaderSummaryJobRepository } from
  "./in-memory-reader-summary-job.repository";

export class InMemoryReaderSummaryOperatorCancellation
implements ReaderSummaryOperatorCancellationPort {
  constructor(
    private readonly jobs: InMemoryReaderSummaryJobRepository,
    private readonly clock: Clock,
  ) {}

  async preview(params: Parameters<ReaderSummaryOperatorCancellationPort["preview"]>[0]) {
    return Promise.all(params.jobIds.map(async (jobId) => {
      const job = await this.jobs.findById({ tenantId: tenantId(params.tenantId),
        workspaceId: workspaceId(params.workspaceId), readerSummaryJobId: jobId });
      return { jobId, status: job?.toSnapshot().status ?? "not_found" };
    }));
  }

  cancel(params: Parameters<ReaderSummaryOperatorCancellationPort["cancel"]>[0]) {
    return this.jobs.runExclusive(async () => Promise.all(params.jobIds.map(async (jobId) => {
      const job = await this.jobs.findById({ tenantId: tenantId(params.tenantId),
        workspaceId: workspaceId(params.workspaceId), readerSummaryJobId: jobId });
      if (job === null) return { jobId, status: "not_found" as const };
      const snapshot = job.toSnapshot();
      if (snapshot.status === "completed" || snapshot.status === "no_signal") {
        return { jobId, status: "already_published" as const };
      }
      if (snapshot.status !== "requested" && snapshot.status !== "running") {
        return { jobId, status: "already_terminal" as const };
      }
      await this.jobs.save(job.cancelByOperator({ cancelledAt: this.clock.now() }));
      return { jobId, status: "cancelled" as const };
    })));
  }
}
