import { buildReaderSummaryV3Evidence } from
  "../../features/execute-reader-summary-job/reader-summary-v3-execution";
import { candidate, setup, TestPresentation } from
  "./relevance-reader-summary-v3-promotion.fixture";

describe("V3 promotion with a manifest frozen before engagement times", () => {
  // Regression: such a job used to fail as presentation_dependency_unavailable,
  // which sent operators to the headline model instead of a rebuild.
  it("fails the job as preparation_manifest_outdated without presenting", async () => {
    const presentation = new TestPresentation();
    const fixture = setup([candidate(2, "useful", "central")], presentation);
    const { engagementObservedAt: dropped, ...legacy } = fixture.manifest.candidates[0]!;
    void dropped;
    const manifest = { ...fixture.manifest, candidates: [legacy] };
    const saved: unknown[] = [];

    await expect(fixture.subject.build({ job: fixture.job, manifest }))
      .resolves.toEqual({ kind: "manifest_outdated" });
    const outcome = await buildReaderSummaryV3Evidence({ job: fixture.job, manifest,
      promotion: fixture.subject, clock: { now: () => new Date("2026-09-21T00:05:00.000Z") },
      claimStartedAt: fixture.job.toSnapshot().startedAt!,
      jobs: { saveExecutionOutcome: async (params: { job: unknown }) => {
        saved.push(params.job); return true; } } as never });

    expect(outcome.kind).toBe("result");
    expect(saved).toHaveLength(1);
    expect((saved[0] as { toSnapshot(): { terminalFailureCode?: string } })
      .toSnapshot().terminalFailureCode).toBe("preparation_manifest_outdated");
    expect(presentation.attempted).toBe(0);
  });
});
