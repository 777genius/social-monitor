import type { ConversationUnitRepositoryPort } from "@social-monitor/conversation/ports";
import type { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { GITHUB_ISSUES_PROVIDER_KEY } from "../../libs/ingestion/adapters/source/github/github-source.provider";
import { writeLiveEvidenceArtifactAtomically } from "./live-evidence-artifact";
import type { LiveReaderSummarySmokeResult, ScanMetrics, LiveProviderKey, ScanTarget} from "./live-multi-provider-summary-support";
import { sha256 } from "./live-multi-provider-summary-support";
import { readOptionalEnv, frontendFixturePathEnv, evidencePathEnv, sampledAt } from "./live-multi-provider-summary-config";

export const writeOptionalFrontendFixture = (input: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly readerSummary: LiveReaderSummarySmokeResult;
}): void => {
  const fixturePath = readOptionalEnv(frontendFixturePathEnv);
  if (fixturePath === undefined) {
    return;
  }

  const generatedAt = new Date().toISOString();
  const artifact = {
    schemaVersion: 1,
    format: "frontend-reader-summary-live-fixture-v1",
    generatedAt,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    readerSummaryArtifact: input.readerSummary.frontendArtifact,
    evidence: {
      selectedProviders: input.readerSummary.selectedProviders,
      citedProviders: input.readerSummary.citedProviders,
      readerSourceMixProviders: input.readerSummary.readerSourceMixProviders,
      topReadProviders: input.readerSummary.topReadProviders,
      topReadCount: input.readerSummary.topReadCount,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadIncluded: false,
      tokenValuesIncluded: false,
    },
  };

  writeLiveEvidenceArtifactAtomically(
    fixturePath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    frontendFixturePathEnv,
  );
};

export const countConversationUnitsByRootFeedItemIds = async (params: {
  readonly tenantId: ReturnType<typeof tenantId>;
  readonly workspaceId: ReturnType<typeof workspaceId>;
  readonly repository: ConversationUnitRepositoryPort;
  readonly rootFeedItemIds: readonly string[];
}): Promise<number> => {
  if (params.rootFeedItemIds.length === 0) {
    return 0;
  }

  const units = await params.repository.listByRootFeedItemIds({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    rootFeedItemIds: params.rootFeedItemIds,
    limitPerRoot: 1_000,
  });

  return units.length;
};

export const writeOptionalEvidenceArtifact = (input: {
  readonly scanMetrics: readonly ScanMetrics[];
  readonly feedItemCount: number;
  readonly selectedFeedItemCount: number;
  readonly conversationUnitCount: number;
  readonly selectedConversationUnitCount: number;
  readonly selectedProviders: readonly LiveProviderKey[];
  readonly citedProviders: readonly string[];
  readonly citationCount: number;
  readonly summaryStatus: string;
  readonly summaryReadyPublished: boolean;
  readonly summaryModelProvider: string;
  readonly summaryModelVersion: string;
  readonly summaryEstimatedCostUsd: number;
  readonly summaryQualityFlags: readonly string[];
  readonly readerSummary: LiveReaderSummarySmokeResult;
  readonly targets: readonly ScanTarget[];
}): void => {
  const evidencePath = readOptionalEnv(evidencePathEnv);
  if (evidencePath === undefined) {
    return;
  }

  const generatedAt = new Date().toISOString();
  const artifact = {
    schemaVersion: 1,
    artifactId: "live-multi-provider-summary-smoke-evidence-v1",
    format: "live-multi-provider-summary-smoke-evidence-v1",
    scope: "backend-only",
    frontendPolicy: "deferred_contract_only",
    generatedAt,
    sampledAt: sampledAt.toISOString(),
    provenance: {
      commitSha: readOptionalEnv("BACKEND_GIT_COMMIT_SHA") ?? null,
      imageDigest: readOptionalEnv("BACKEND_IMAGE_DIGEST") ?? null,
      environmentId: readOptionalEnv("SOURCE_LIVE_ENVIRONMENT_ID") ?? null,
      operator: readOptionalEnv("SOURCE_LIVE_OPERATOR") ?? null,
      runner: "scripts/check-live-multi-provider-summary-smoke.ts",
      fixtureOnly: false,
    },
    providers: input.targets.map((target) => ({
      providerKey: target.providerKey,
      sourceBindingId: target.sourceBindingId,
      queryMode: target.sourceQuery.mode,
      querySha256: sha256(target.sourceQuery.query),
      rawQueryIncluded: false,
      authMode:
        target.providerKey === "reddit"
          ? "app_only_oauth"
          : target.providerKey === GITHUB_ISSUES_PROVIDER_KEY &&
              readOptionalEnv("GITHUB_ACCESS_TOKEN") !== undefined
            ? "token_redacted"
            : "public_or_anonymous",
    })),
    signals: [
      {
        signalId: "live-multi-provider-scan-to-summary",
        status: "passed",
        observedAt: generatedAt,
        evidence: {
          requiredProviderCount: input.targets.length,
          feedItemCount: input.feedItemCount,
          selectedFeedItemCount: input.selectedFeedItemCount,
          conversationUnitCount: input.conversationUnitCount,
          selectedConversationUnitCount: input.selectedConversationUnitCount,
          selectedProviders: input.selectedProviders,
          citedProviders: input.citedProviders,
          citationCount: input.citationCount,
          summaryCompleted: input.summaryStatus === "completed",
          summaryReadyPublished: input.summaryReadyPublished,
          summaryModelProvider: input.summaryModelProvider,
          summaryModelVersion: input.summaryModelVersion,
          summaryEstimatedCostUsd: input.summaryEstimatedCostUsd,
          summaryQualityFlags: input.summaryQualityFlags,
          readerSummarySelectedProviders: input.readerSummary.selectedProviders,
          readerSummaryCitedProviders: input.readerSummary.citedProviders,
          readerSummaryReaderSourceMixProviders:
            input.readerSummary.readerSourceMixProviders,
          readerSummaryReaderSourceMixCounts:
            input.readerSummary.readerSourceMixCounts,
          readerSummaryTopReadProviders: input.readerSummary.topReadProviders,
          readerSummaryTopReadCount: input.readerSummary.topReadCount,
          readerSummaryQualityFlags: input.readerSummary.qualityFlags,
        },
      },
    ],
    metrics: {
      scans: input.scanMetrics,
      feedItems: input.feedItemCount,
      selectedFeedItems: input.selectedFeedItemCount,
      conversationUnits: input.conversationUnitCount,
      selectedConversationUnits: input.selectedConversationUnitCount,
      citedProviders: input.citedProviders,
      citations: input.citationCount,
      summaryModelProvider: input.summaryModelProvider,
      summaryModelVersion: input.summaryModelVersion,
      summaryEstimatedCostUsd: input.summaryEstimatedCostUsd,
      readerSummaryId: input.readerSummary.readerSummaryId,
      readerSummarySelectedProviders: input.readerSummary.selectedProviders,
      readerSummaryCitedProviders: input.readerSummary.citedProviders,
      readerSummaryReaderSourceMixProviders:
        input.readerSummary.readerSourceMixProviders,
      readerSummaryReaderSourceMixCounts:
        input.readerSummary.readerSourceMixCounts,
      readerSummaryTopReadProviders: input.readerSummary.topReadProviders,
      readerSummaryTopReadCount: input.readerSummary.topReadCount,
      readerSummaryQualityFlags: input.readerSummary.qualityFlags,
    },
    redaction: {
      secretsIncluded: false,
      rawProviderPayloadIncluded: false,
      rawFeedItemTextIncluded: false,
      rawSummaryTextIncluded: false,
      rawQueryIncluded: false,
      tokenValuesIncluded: false,
    },
  };

  writeLiveEvidenceArtifactAtomically(
    evidencePath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    evidencePathEnv,
  );
};
