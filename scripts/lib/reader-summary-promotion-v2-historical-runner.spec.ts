import type {
  HistoricalPromotionAuthorityInspection,
} from "./reader-summary-promotion-v2-historical-classification";
import { buildReaderSummaryDayDatasetManifest } from
  "./reader-summary-day-dataset-manifest";
import {
  buildHistoricalPromotionCanonicalInput,
  historicalPromotionCanonicalInputDigest,
} from "./reader-summary-promotion-v2-historical-input";
import {
  ReaderSummaryPromotionV2HistoricalRunner,
  type HistoricalPromotionDurableState,
  type HistoricalPromotionEvidenceBundle,
  type HistoricalPromotionMutationOutcome,
  type HistoricalPromotionRebuildReceipt,
  type HistoricalPromotionRunnerOptions,
} from "./reader-summary-promotion-v2-historical-runner";

describe("Reader Summary Promotion V2 historical runner", () => {
  it("is dry-run by contract and never invokes mutation", async () => {
    const scenario = harness();

    const [receipt] = await scenario.run({ dryRun: true });

    expect(receipt).toMatchObject({
      mode: "dry-run",
      status: "planned",
      fenceToken: null,
      pointerSwitch: { attempted: false, switched: false },
    });
    expect(scenario.rebuild).not.toHaveBeenCalled();
  });

  it("rejects today before reading authority or acquiring mutation", async () => {
    const scenario = harness();

    await expect(scenario.runner.run({
      ...scenario.options,
      dates: ["2026-08-31"],
      now: new Date("2026-08-31T12:00:00.000Z"),
    })).rejects.toThrow("not a closed UTC date");
    expect(scenario.inspectAuthority).not.toHaveBeenCalled();
    expect(scenario.rebuild).not.toHaveBeenCalled();
  });

  it("requires --resume for a pending receipt and resumes only safe work", async () => {
    const scenario = harness();
    scenario.mutationOutcome = {
      status: "pending",
      fenceToken: "reader-summary-date:2026-08-01:1",
      reason: "provider_lineage_unavailable",
      retrySafety: "safe-before-paid-operation",
      pointerSwitchAttempted: false,
    };
    const [pending] = await scenario.run({ resume: true });
    expect(pending?.status).toBe("pending");
    expect(scenario.rebuild).toHaveBeenCalledTimes(1);

    const [withoutResume] = await scenario.run({ resume: false });
    expect(withoutResume?.reason).toBe("resume_required");
    expect(scenario.rebuild).toHaveBeenCalledTimes(1);

    scenario.mutationOutcome = completedOutcome();
    const [resumed] = await scenario.run({ resume: true });
    expect(resumed?.status).toBe("completed");
    expect(scenario.rebuild).toHaveBeenCalledTimes(2);
  });

  it("makes a duplicate identical complete identity a verified no-op", async () => {
    const scenario = harness();
    const [completed] = await scenario.run({ resume: true });
    expect(completed?.status).toBe("completed");
    scenario.durableState = {
      state: "complete-active",
      jobId: output().jobId,
      artifactId: output().artifactId,
      publicationId: output().publicationId,
      activePublicationId: output().publicationId,
      previousPublicationId: output().previousPublicationId,
    };

    const [noop] = await scenario.run({ resume: true });

    expect(noop).toMatchObject({
      status: "noop",
      reason: "same_complete_v2_identity_already_active",
      qualityGates: { apiVisibilityVerified: true },
    });
    expect(scenario.rebuild).toHaveBeenCalledTimes(1);
    expect(scenario.verifyCompleted).toHaveBeenCalledTimes(1);
  });

  it("never collides different full input digests in durable reconciliation", async () => {
    const scenario = harness();
    await scenario.run({ resume: true });
    const firstIdentity = scenario.reconcile.mock.calls[0]?.[1];
    const original = scenario.options.evidence.get("2026-08-01")!;
    const canonicalInput = {
      ...original.canonicalInput,
      sourcePublication: {
        ...original.canonicalInput.sourcePublication,
        proofSha256: "f".repeat(64),
      },
    };
    const changed = {
      ...original,
      canonicalInput,
      authoritativeInputDigest:
        historicalPromotionCanonicalInputDigest(canonicalInput),
      sourcePublicationProofSha256: "f".repeat(64),
    };

    await scenario.run({
      resume: true,
      evidence: new Map([["2026-08-01", changed]]),
    });

    const secondIdentity = scenario.reconcile.mock.calls[1]?.[1];
    expect(secondIdentity).not.toBe(firstIdentity);
    expect(scenario.rebuild).toHaveBeenCalledTimes(2);
  });

  it("does not repeat an uncertain model job or switch an interrupted date", async () => {
    const scenario = harness();
    scenario.durableState = {
      state: "in-flight",
      jobId: "00000000-0000-4000-8000-000000000310",
      activePublicationId: output().previousPublicationId,
      reason: "durable_model_job_may_have_started",
    };

    const [receipt] = await scenario.run({ resume: true });

    expect(receipt).toMatchObject({
      status: "pending",
      retrySafety: "requires-durable-reconciliation",
      pointerSwitch: {
        attempted: false,
        switched: false,
        activePublicationId: null,
      },
    });
    expect(scenario.rebuild).not.toHaveBeenCalled();
  });

  it("records interruption before pointer switch without fabricating success", async () => {
    const scenario = harness();
    scenario.mutationOutcome = {
      status: "pending",
      fenceToken: "reader-summary-date:2026-08-01:4",
      reason: "interrupted_before_pointer_switch",
      retrySafety: "requires-durable-reconciliation",
      pointerSwitchAttempted: false,
    };

    const [receipt] = await scenario.run({ resume: true });

    expect(receipt).toMatchObject({
      status: "pending",
      reason: "interrupted_before_pointer_switch",
      fenceToken: "reader-summary-date:2026-08-01:4",
      outputIdentity: null,
      qualityGates: null,
      pointerSwitch: { attempted: false, switched: false },
    });
  });

  it("continues independent dates when one authority lineage fails", async () => {
    const scenario = harness(["2026-08-01", "2026-08-02"]);
    scenario.inspectAuthority.mockImplementation(async (date: string) => {
      if (date === "2026-08-01") throw new Error("provider unavailable");
      return inspection(date);
    });

    const receipts = await scenario.run({ dryRun: true });

    expect(receipts.map((receipt) => receipt.status)).toEqual([
      "pending",
      "planned",
    ]);
    expect(receipts[0]).toMatchObject({
      identity: null,
      classification: null,
      reason: "authoritative_input_or_provider_lineage_unavailable",
    });
  });

  it("keeps a date-specific evidence failure pending while another plans", async () => {
    const scenario = harness(["2026-08-01", "2026-08-02"]);
    const receipts = await scenario.run({
      dryRun: true,
      evidenceProblems: new Map([
        ["2026-08-01", "source_report_hash_mismatch"],
      ]),
    });

    expect(receipts).toMatchObject([
      { status: "pending", reason: "source_report_hash_mismatch" },
      { status: "planned" },
    ]);
  });

  it("never exceeds two concurrent dates", async () => {
    const dates = [
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ];
    const scenario = harness(dates);
    let active = 0;
    let maximum = 0;
    scenario.inspectAuthority.mockImplementation(async (date: string) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return inspection(date);
    });

    await scenario.run({ dryRun: true, batchSize: 2 });

    expect(maximum).toBe(2);
  });

  it("rejects a batch size above two", async () => {
    const scenario = harness();
    await expect(scenario.run({ batchSize: 3 })).rejects.toThrow(
      "--batch-size must be 1 or 2",
    );
  });
});

const harness = (dates = ["2026-08-01"]) => {
  const saved = new Map<string, HistoricalPromotionRebuildReceipt>();
  const mutable = {
    durableState: { state: "none" } as HistoricalPromotionDurableState,
    mutationOutcome: completedOutcome() as HistoricalPromotionMutationOutcome,
  };
  const inspectAuthority = jest.fn(async (date: string) => inspection(date));
  const reconcile = jest.fn(
    async (
      _date: string,
      _rebuildIdentity: string,
      _bundle: HistoricalPromotionEvidenceBundle | undefined,
    ): Promise<HistoricalPromotionDurableState> => {
      void [_date, _rebuildIdentity, _bundle];
      return mutable.durableState;
    },
  );
  const rebuild = jest.fn(
    async (): Promise<HistoricalPromotionMutationOutcome> =>
      mutable.mutationOutcome,
  );
  const verifyCompleted = jest.fn(async () => output());
  const options: HistoricalPromotionRunnerOptions = {
    dates,
    batchSize: 2,
    dryRun: false,
    resume: false,
    now: new Date("2026-08-31T12:00:00.000Z"),
    evidence: evidenceMap(dates),
    evidenceProblems: new Map<string, string>(),
  };
  const runner = new ReaderSummaryPromotionV2HistoricalRunner({
    authority: { inspect: inspectAuthority },
    durableState: { reconcile },
    mutation: { rebuild, verifyCompleted },
    receipts: {
      load: async (date) => saved.get(date) ?? null,
      save: async (receipt) => {
        if (receipt.mode === "execute") saved.set(receipt.date, receipt);
      },
    },
    clock: () => new Date("2026-08-31T12:00:00.000Z"),
  });
  const scenario = {
    get durableState(): HistoricalPromotionDurableState {
      return mutable.durableState;
    },
    set durableState(value: HistoricalPromotionDurableState) {
      mutable.durableState = value;
    },
    get mutationOutcome(): HistoricalPromotionMutationOutcome {
      return mutable.mutationOutcome;
    },
    set mutationOutcome(value: HistoricalPromotionMutationOutcome) {
      mutable.mutationOutcome = value;
    },
    inspectAuthority,
    reconcile,
    rebuild,
    verifyCompleted,
    options,
    runner,
    run: (overrides: Partial<HistoricalPromotionRunnerOptions> = {}) =>
      runner.run({ ...options, ...overrides }),
  };
  return scenario;
};

const inspection = (date: string): HistoricalPromotionAuthorityInspection => ({
  rows: [{
    feedItemId: `feed-${date}`,
    providerKey: "reddit",
    providerMetadata: { kind: "reddit_post", score: 80, upvoteRatio: 0.9 },
    publishedAt: `${date}T08:00:00.000Z`,
    observedAt: `${date}T09:00:00.000Z`,
  }],
  engagementSnapshotCount: 1,
  engagementObservationByOriginalDayEndCount: 1,
});

const evidenceMap = (
  dates: readonly string[],
): ReadonlyMap<string, HistoricalPromotionEvidenceBundle> => new Map(
  dates.map((date) => {
    const dataset = buildReaderSummaryDayDatasetManifest({
      tenantId: "00000000-0000-4000-8000-000000000501",
      workspaceId: "00000000-0000-4000-8000-000000000502",
      startedAt: new Date(`${date}T00:00:00.000Z`),
      endedAt: new Date(`${nextDate(date)}T00:00:00.000Z`),
      generatedAt: new Date("2026-08-31T11:55:00.000Z"),
      feedRows: [{ providerKey: "reddit", rowJson: `{"date":"${date}"}` }],
      eligibilityRows: [],
    });
    const sourcePublication = {
      kind: "active-database-publication" as const,
      publicationId: "00000000-0000-4000-8000-000000000301",
      artifactId: "00000000-0000-4000-8000-000000000301",
      reportSha256: "b".repeat(64),
      proofSha256: "a".repeat(64),
    };
    const canonical = buildHistoricalPromotionCanonicalInput({
      date,
      sourcePublication,
      datasetManifest: dataset,
      datasetManifestSha256: "e".repeat(64),
      supportingEvidence: { kind: "active-database-publication" },
      allowHistoricalGitHubOmission: true,
      historicalGitHubOmissionReason:
        "No preserved GitHub rows exist in this deterministic runner fixture.",
    });
    return [date, {
      date,
      authoritativeInputDigest: canonical.authoritativeInputDigest,
      canonicalInput: canonical.envelope,
      sourcePublicationId: sourcePublication.publicationId,
      sourceArtifactId: sourcePublication.artifactId,
      sourcePublicationReportSha256: sourcePublication.reportSha256,
      sourcePublicationProofSha256: sourcePublication.proofSha256,
      sourceEvidence: { kind: "active-database-publication" as const },
      datasetManifestPath: `/evidence/${date}/dataset.json`,
      datasetManifestSha256: "e".repeat(64),
      timestampPolicy: "published_at" as const,
      allowHistoricalGitHubOmission: true,
      historicalGitHubOmissionReason:
        "No preserved GitHub rows exist in this deterministic runner fixture.",
    }];
  }),
);

const nextDate = (date: string): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
};

const output = () => ({
  jobId: "00000000-0000-4000-8000-000000000310",
  artifactId: "00000000-0000-4000-8000-000000000311",
  publicationId: "00000000-0000-4000-8000-000000000311",
  previousPublicationId: "00000000-0000-4000-8000-000000000301",
  reportSha256: "f".repeat(64),
  proofSha256: "9".repeat(64),
  selectedCounts: { top: 8, additional: 5, citations: 13 },
  qualityGates: {
    promotionV2Attested: true as const,
    citationsVerified: true as const,
    publicationProofVerified: true as const,
    apiVisibilityVerified: true as const,
  },
});

const completedOutcome = (): HistoricalPromotionMutationOutcome => ({
  status: "completed",
  fenceToken: "reader-summary-date:2026-08-01:1",
  output: output(),
});
