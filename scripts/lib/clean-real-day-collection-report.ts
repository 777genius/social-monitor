import type { ProviderCollectionObservation } from "./provider-collection-observability";

export type CleanRealDayCollectionProviderKey =
  "github-trending-page" | "hacker-news" | "reddit" | "rss" | "x-twitter";

export type CleanRealDayCollectionReport = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "reader-summary-clean-real-day-collection-v1";
  readonly generatedBy: string;
  readonly model: {
    readonly mode: "targeted_real_binding_collection";
    readonly liveNetwork: true;
    readonly rawProviderPayloadPersistedInReport: false;
    readonly rawPostTextPersistedInReport: false;
    readonly rawProviderConfigPersistedInReport: false;
  };
  readonly inputs: {
    readonly database: "local-postgres";
    readonly providerKeys: readonly CleanRealDayCollectionProviderKey[];
    readonly xCollectorConfigured: boolean;
    readonly targetPublishedWindow: {
      readonly startInclusive: string;
      readonly endExclusive: string;
    };
  };
  readonly run: {
    readonly startedAt: string;
    readonly completedAt: string;
    readonly collectionDate: string;
  };
  readonly targets: readonly {
    readonly providerKey: CleanRealDayCollectionProviderKey;
    readonly bindingFingerprint: string;
    readonly interestFingerprint: string;
    readonly workspaceFingerprint: string;
    readonly plannerEnabled: boolean;
    readonly canaryRollout: boolean;
  }[];
  readonly scans: readonly {
    readonly providerKey: CleanRealDayCollectionProviderKey;
    readonly bindingFingerprint: string;
    readonly attemptCount: number;
    readonly status: "succeeded" | "failed" | "skipped";
    readonly fetched: number;
    readonly inserted: number;
    readonly projected: number;
    readonly skippedDuplicates: number;
    readonly warningCount: number;
    readonly observability: ProviderCollectionObservation;
    readonly failureFingerprint?: string;
  }[];
  readonly freshWindow: {
    readonly feedItemCount: number;
    readonly providerCounts: Record<string, number>;
    readonly newestItemAtByProvider: Record<string, string>;
    readonly sourceQueryLaneCoverageByProvider: Record<string, number>;
    readonly distinctSourceQueryLaneCountByProvider: Record<string, number>;
    readonly orphanInterestCount: number;
    readonly orphanSourceBindingCount: number;
    readonly interestSnapshotCoverage: number;
    readonly sourceBindingSnapshotCoverage: number;
    readonly sourceQueryLaneCoverage: number;
    readonly distinctSourceQueryLaneCount: number;
  };
  readonly targetWindow: CleanRealDayCollectionReport["freshWindow"];
  readonly qualityGates: Record<string, boolean>;
  readonly blockingPassed: boolean;
};
