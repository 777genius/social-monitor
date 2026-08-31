import type {
  HistoricalPromotionAuthorityInspection,
  HistoricalPromotionClassification,
} from "./reader-summary-promotion-v2-historical-classification";
import {
  assertClosedUtcDate,
  classifyHistoricalPromotionAuthority,
  historicalPromotionRebuildIdentity,
  readerSummaryPromotionV2HistoricalPolicyVersion,
} from "./reader-summary-promotion-v2-historical-classification";

export type HistoricalPromotionEvidenceBundle = Readonly<{
  date: string;
  expectedAuthoritativeInputDigest: string;
  sourcePublicationId: string;
  sourceArtifactId: string;
  sourcePublicationProofSha256: string;
  sourceReportPath: string;
  sourceReportSha256: string;
  collectionArtifactPath: string;
  collectionArtifactSha256: string;
  collectionQualityReportPath: string;
  collectionQualityReportSha256: string;
  datasetManifestPath: string;
  datasetManifestSha256: string;
  timestampPolicy: "published_at" | "observed_at";
  allowHistoricalGitHubOmission: boolean;
  historicalGitHubOmissionReason?: string;
}>;

export type HistoricalPromotionDurableState = Readonly<{
  state:
    | "none"
    | "requested"
    | "in-flight"
    | "failed"
    | "quality-rejected"
    | "complete-active"
    | "complete-detached"
    | "ambiguous";
  jobId?: string;
  artifactId?: string;
  publicationId?: string;
  activePublicationId?: string;
  previousPublicationId?: string;
  reason?: string;
}>;

export type HistoricalPromotionVerifiedOutput = Readonly<{
  jobId: string;
  artifactId: string;
  publicationId: string;
  previousPublicationId: string;
  reportSha256: string;
  proofSha256: string;
  selectedCounts: {
    top: number;
    additional: number;
    citations: number;
  };
  qualityGates: {
    promotionV2Attested: true;
    citationsVerified: true;
    publicationProofVerified: true;
    apiVisibilityVerified: true;
  };
}>;

export type HistoricalPromotionMutationOutcome =
  | Readonly<{
      status: "completed";
      fenceToken: string;
      output: HistoricalPromotionVerifiedOutput;
    }>
  | Readonly<{
      status: "pending";
      fenceToken: string;
      reason: string;
      retrySafety:
        | "safe-before-paid-operation"
        | "requires-durable-reconciliation";
      pointerSwitchAttempted: boolean;
    }>;

export type HistoricalPromotionRebuildReceipt = Readonly<{
  schemaVersion: 1;
  format: "reader-summary-promotion-v2-historical-rebuild-receipt-v1";
  generatedAt: string;
  mode: "dry-run" | "execute";
  date: string;
  status: "planned" | "unrebuildable" | "pending" | "completed" | "noop";
  reason: string;
  identity: {
    rebuildIdentity: string;
    authoritativeInputDigest: string;
    policyVersion: typeof readerSummaryPromotionV2HistoricalPolicyVersion;
  } | null;
  classification: HistoricalPromotionClassification | null;
  fenceToken: string | null;
  retrySafety:
    | "not-applicable"
    | "safe-before-paid-operation"
    | "requires-durable-reconciliation";
  outputIdentity: {
    jobId: string;
    artifactId: string;
    publicationId: string;
    reportSha256: string;
    proofSha256: string;
  } | null;
  selectedCounts: HistoricalPromotionVerifiedOutput["selectedCounts"] | null;
  qualityGates: HistoricalPromotionVerifiedOutput["qualityGates"] | null;
  pointerSwitch: {
    authority: "PrismaReaderSummaryPublication.publish_reader_summary";
    attempted: boolean;
    switched: boolean;
    previousPublicationId: string | null;
    activePublicationId: string | null;
  };
}>;

export interface HistoricalPromotionAuthorityReader {
  inspect(date: string): Promise<HistoricalPromotionAuthorityInspection>;
}

export interface HistoricalPromotionDurableStateReader {
  reconcile(
    date: string,
    rebuildIdentity: string,
    bundle: HistoricalPromotionEvidenceBundle | undefined,
  ): Promise<HistoricalPromotionDurableState>;
}

export interface HistoricalPromotionMutation {
  rebuild(input: {
    date: string;
    rebuildIdentity: string;
    classification: HistoricalPromotionClassification;
    bundle: HistoricalPromotionEvidenceBundle;
  }): Promise<HistoricalPromotionMutationOutcome>;

  verifyCompleted(input: {
    date: string;
    rebuildIdentity: string;
    state: HistoricalPromotionDurableState;
  }): Promise<HistoricalPromotionVerifiedOutput>;
}

export interface HistoricalPromotionReceiptStore {
  load(date: string): Promise<HistoricalPromotionRebuildReceipt | null>;
  save(receipt: HistoricalPromotionRebuildReceipt): Promise<void>;
}

export type HistoricalPromotionRunnerOptions = Readonly<{
  dates: readonly string[];
  batchSize: number;
  dryRun: boolean;
  resume: boolean;
  now: Date;
  evidence: ReadonlyMap<string, HistoricalPromotionEvidenceBundle>;
  evidenceProblems?: ReadonlyMap<string, string>;
}>;

export class ReaderSummaryPromotionV2HistoricalRunner {
  constructor(private readonly dependencies: {
    authority: HistoricalPromotionAuthorityReader;
    durableState: HistoricalPromotionDurableStateReader;
    mutation: HistoricalPromotionMutation;
    receipts: HistoricalPromotionReceiptStore;
    clock: () => Date;
  }) {}

  async run(
    options: HistoricalPromotionRunnerOptions,
  ): Promise<readonly HistoricalPromotionRebuildReceipt[]> {
    const dates = validateOptions(options);
    return runBounded(dates, options.batchSize, async (date) => {
      const receipt = await this.processDate(date, options);
      await this.dependencies.receipts.save(receipt);
      return receipt;
    });
  }

  private async processDate(
    date: string,
    options: HistoricalPromotionRunnerOptions,
  ): Promise<HistoricalPromotionRebuildReceipt> {
    let inspection: HistoricalPromotionAuthorityInspection;
    try {
      inspection = await this.dependencies.authority.inspect(date);
    } catch {
      return this.uninspectedPendingReceipt(
        date,
        options.dryRun ? "dry-run" : "execute",
      );
    }
    const classification = classifyHistoricalPromotionAuthority({
      date,
      inspection,
    });
    const rebuildIdentity = historicalPromotionRebuildIdentity({
      date,
      authoritativeInputDigest: classification.authoritativeInputDigest,
    });
    const bundle = options.evidence.get(date);
    const base = this.baseReceipt({
      date,
      mode: options.dryRun ? "dry-run" : "execute",
      classification,
      rebuildIdentity,
    });

    if (classification.kind === "unrebuildable") {
      return {
        ...base,
        status: "unrebuildable",
        reason: classification.reason,
      };
    }
    const evidenceProblem = options.evidenceProblems?.get(date) ??
      validateEvidenceBundle(bundle, classification);
    if (evidenceProblem !== null) {
      return pendingReceipt(base, evidenceProblem, "safe-before-paid-operation");
    }
    let durableState: HistoricalPromotionDurableState;
    try {
      durableState = await this.dependencies.durableState.reconcile(
        date,
        rebuildIdentity,
        bundle,
      );
    } catch {
      return pendingReceipt(
        base,
        "durable_publication_state_unavailable",
        "safe-before-paid-operation",
      );
    }
    if (options.dryRun) {
      return {
        ...base,
        status: "planned",
        reason: `dry_run_${durableState.state}`,
      };
    }

    const prior = await this.dependencies.receipts.load(date);
    if (
      prior?.identity?.rebuildIdentity === rebuildIdentity &&
      (prior.status === "completed" || prior.status === "noop")
    ) {
      if (durableState.state !== "complete-active") {
        return pendingReceipt(
          base,
          "completed_receipt_does_not_match_active_publication",
          "requires-durable-reconciliation",
        );
      }
      try {
        return this.completedReceipt(
          base,
          await this.dependencies.mutation.verifyCompleted({
            date,
            rebuildIdentity,
            state: durableState,
          }),
          "noop",
          "same_complete_v2_identity_already_active",
          null,
        );
      } catch {
        return pendingReceipt(
          base,
          "active_publication_visibility_requires_reconciliation",
          "requires-durable-reconciliation",
        );
      }
    }
    if (prior?.status === "pending" && !options.resume) {
      return pendingReceipt(base, "resume_required", prior.retrySafety);
    }
    if (durableState.state === "complete-active") {
      try {
        const verified = await this.dependencies.mutation.verifyCompleted({
          date,
          rebuildIdentity,
          state: durableState,
        });
        return this.completedReceipt(
          base,
          verified,
          "noop",
          "durable_complete_v2_identity_reconciled",
          null,
        );
      } catch {
        return pendingReceipt(
          base,
          "active_publication_visibility_requires_reconciliation",
          "requires-durable-reconciliation",
        );
      }
    }
    if (durableState.state === "complete-detached" ||
        durableState.state === "ambiguous") {
      return pendingReceipt(
        base,
        durableState.reason ?? "ambiguous_publication_state",
        "requires-durable-reconciliation",
      );
    }
    if (["in-flight", "failed", "quality-rejected"].includes(
      durableState.state,
    )) {
      return pendingReceipt(
        base,
        durableState.reason ?? `durable_job_${durableState.state}`,
        "requires-durable-reconciliation",
      );
    }

    let outcome: HistoricalPromotionMutationOutcome;
    try {
      outcome = await this.dependencies.mutation.rebuild({
        date,
        rebuildIdentity,
        classification,
        bundle: bundle!,
      });
    } catch {
      return {
        ...pendingReceipt(
          base,
          "mutation_outcome_requires_durable_reconciliation",
          "requires-durable-reconciliation",
        ),
        pointerSwitch: { ...base.pointerSwitch, attempted: true },
      };
    }
    if (outcome.status === "pending") {
      return {
        ...pendingReceipt(base, outcome.reason, outcome.retrySafety),
        fenceToken: outcome.fenceToken,
        pointerSwitch: {
          ...base.pointerSwitch,
          attempted: outcome.pointerSwitchAttempted,
        },
      };
    }
    return this.completedReceipt(
      base,
      outcome.output,
      "completed",
      "v2_publication_verified_and_active",
      outcome.fenceToken,
    );
  }

  private baseReceipt(input: {
    date: string;
    mode: "dry-run" | "execute";
    classification: HistoricalPromotionClassification;
    rebuildIdentity: string;
  }): HistoricalPromotionRebuildReceipt {
    return {
      schemaVersion: 1,
      format: "reader-summary-promotion-v2-historical-rebuild-receipt-v1",
      generatedAt: this.dependencies.clock().toISOString(),
      mode: input.mode,
      date: input.date,
      status: "planned",
      reason: "not_started",
      identity: {
        rebuildIdentity: input.rebuildIdentity,
        authoritativeInputDigest:
          input.classification.authoritativeInputDigest,
        policyVersion: readerSummaryPromotionV2HistoricalPolicyVersion,
      },
      classification: input.classification,
      fenceToken: null,
      retrySafety: "not-applicable",
      outputIdentity: null,
      selectedCounts: null,
      qualityGates: null,
      pointerSwitch: {
        authority: "PrismaReaderSummaryPublication.publish_reader_summary",
        attempted: false,
        switched: false,
        previousPublicationId: null,
        activePublicationId: null,
      },
    };
  }

  private completedReceipt(
    base: HistoricalPromotionRebuildReceipt,
    output: HistoricalPromotionVerifiedOutput,
    status: "completed" | "noop",
    reason: string,
    fenceToken: string | null,
  ): HistoricalPromotionRebuildReceipt {
    return {
      ...base,
      status,
      reason,
      fenceToken,
      outputIdentity: {
        jobId: output.jobId,
        artifactId: output.artifactId,
        publicationId: output.publicationId,
        reportSha256: output.reportSha256,
        proofSha256: output.proofSha256,
      },
      selectedCounts: output.selectedCounts,
      qualityGates: output.qualityGates,
      pointerSwitch: {
        authority: "PrismaReaderSummaryPublication.publish_reader_summary",
        attempted: status === "completed",
        switched: output.publicationId !== output.previousPublicationId,
        previousPublicationId: output.previousPublicationId,
        activePublicationId: output.publicationId,
      },
    };
  }

  private uninspectedPendingReceipt(
    date: string,
    mode: "dry-run" | "execute",
  ): HistoricalPromotionRebuildReceipt {
    return {
      schemaVersion: 1,
      format: "reader-summary-promotion-v2-historical-rebuild-receipt-v1",
      generatedAt: this.dependencies.clock().toISOString(),
      mode,
      date,
      status: "pending",
      reason: "authoritative_input_or_provider_lineage_unavailable",
      identity: null,
      classification: null,
      fenceToken: null,
      retrySafety: "safe-before-paid-operation",
      outputIdentity: null,
      selectedCounts: null,
      qualityGates: null,
      pointerSwitch: {
        authority: "PrismaReaderSummaryPublication.publish_reader_summary",
        attempted: false,
        switched: false,
        previousPublicationId: null,
        activePublicationId: null,
      },
    };
  }
}

const validateOptions = (
  options: HistoricalPromotionRunnerOptions,
): readonly string[] => {
  if (!Number.isInteger(options.batchSize) ||
      options.batchSize < 1 || options.batchSize > 2) {
    throw new Error("Historical promotion --batch-size must be 1 or 2");
  }
  if (options.dates.length === 0) {
    throw new Error("Historical promotion --dates must not be empty");
  }
  const dates = [...new Set(options.dates)].sort();
  if (dates.length !== options.dates.length) {
    throw new Error("Historical promotion --dates must be unique");
  }
  dates.forEach((date) => assertClosedUtcDate(date, options.now));
  return dates;
};

const validateEvidenceBundle = (
  bundle: HistoricalPromotionEvidenceBundle | undefined,
  classification: HistoricalPromotionClassification,
): string | null => {
  if (bundle === undefined) return "hash_bound_input_evidence_missing";
  if (bundle.expectedAuthoritativeInputDigest !==
      classification.authoritativeInputDigest) {
    return "authoritative_input_digest_drift";
  }
  return null;
};

const pendingReceipt = (
  base: HistoricalPromotionRebuildReceipt,
  reason: string,
  retrySafety: HistoricalPromotionRebuildReceipt["retrySafety"],
): HistoricalPromotionRebuildReceipt => ({
  ...base,
  status: "pending",
  reason,
  retrySafety,
});

const runBounded = async <T>(
  values: readonly string[],
  concurrency: number,
  worker: (value: string) => Promise<T>,
): Promise<readonly T[]> => {
  const output = new Array<T>(values.length);
  let cursor = 0;
  const runWorker = async (): Promise<void> => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(values[index]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, runWorker),
  );
  return output;
};
