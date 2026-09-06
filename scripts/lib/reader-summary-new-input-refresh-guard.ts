import type { ReaderSummaryNewInputRefreshAuthority } from
  "@social-monitor/summary/application/contracts/reader-summary-new-input-refresh-authority";
import type { ReaderSummaryJobProps } from "@social-monitor/summary/domain";
import type { ReaderSummaryEvidenceSelectorPort } from "@social-monitor/summary/ports";
import { assertRefreshManifest, refreshHash, type RefreshManifest } from
  "./reader-summary-new-input-refresh-manifest";
import type { RefreshJobState } from "./reader-summary-new-input-refresh-postgres";

export type RefreshGuardDependencies = Readonly<{
  now(): Date;
  assertFences(): void;
  assertCurrent(): Promise<void>;
}>;

/** Requested is already consumed for this bounded route. Even a crash before
 * start requires reconciliation; lease expiry can never authorize a paid retry. */
export class NewInputRefreshGuard implements ReaderSummaryNewInputRefreshAuthority {
  private claimed = false;
  private invalid = false;
  constructor(readonly manifest: RefreshManifest, private readonly jobId: string,
    private readonly deps: RefreshGuardDependencies) {}
  invalidate(): void { this.invalid = true; }
  assertLocal(): void {
    if (this.invalid) throw new Error("Refresh authority requires reconciliation");
    try {
      this.deps.assertFences();
      assertRefreshManifest(this.manifest, this.deps.now());
    } catch (error) { this.invalid = true; throw error; }
  }
  async assertCurrent(): Promise<void> {
    try {
      this.assertLocal();
      await this.deps.assertCurrent();
      this.assertLocal();
    } catch (error) { this.invalid = true; throw error; }
  }
  async claim(job: ReaderSummaryJobProps): Promise<Date> {
    if (this.claimed || job.id !== this.jobId || job.idempotencyKey !== this.manifest.operation ||
        job.status !== "requested" || job.startedAt !== undefined ||
        job.tenantId !== this.manifest.tenantId || job.workspaceId !== this.manifest.workspaceId ||
        job.scope.type !== "workspace" || job.userId !== undefined || job.subscriptionId !== undefined ||
        job.period.cadence !== "daily" || job.period.timezone !== "UTC" ||
        job.period.startedAt.toISOString() !== this.manifest.startedAt ||
        job.period.endedAt.toISOString() !== this.manifest.endedAt) {
      throw new Error("Refresh operation is consumed or has wrong job authority");
    }
    this.claimed = true;
    await this.assertCurrent();
    return new Date(this.manifest.observedThrough);
  }
  selector(delegate: ReaderSummaryEvidenceSelectorPort): ReaderSummaryEvidenceSelectorPort {
    return { select: async (query) => {
      if (!this.claimed || query.observedThrough?.toISOString() !== this.manifest.observedThrough) {
        throw new Error("Refresh selector did not receive the frozen cutoff");
      }
      await this.assertCurrent();
      const selected = await delegate.select(query);
      if (selected.sourceWindow.ingestionCutoff?.toISOString() !== this.manifest.observedThrough) {
        throw new Error("Refresh selector changed the observation cutoff");
      }
      await this.assertCurrent();
      return selected;
    } };
  }
}
export function reconcileRefresh(m: RefreshManifest, jobs: readonly RefreshJobState[],
  current: { publicationId: string; artifactId: string; jobId: string },
): "unconsumed" | "published" {
  if (jobs.length === 0) return "unconsumed";
  const job = jobs[0];
  if (jobs.length !== 1 || job?.operation !== m.operation ||
      !["COMPLETED", "NO_SIGNAL"].includes(job.status) ||
      current.jobId !== job.jobId || current.artifactId !== job.artifactId ||
      current.publicationId !== job.artifactId) {
    throw new Error("Refresh generation budget is consumed; reconcile the original job");
  }
  return "published";
}
export const assertRefreshEqual = (actual: unknown, expected: unknown, label: string): void => {
  if (refreshHash(actual) !== refreshHash(expected)) throw new Error(`Refresh ${label} drifted`);
};
