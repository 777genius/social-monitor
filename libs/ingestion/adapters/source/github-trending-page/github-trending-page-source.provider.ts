import { redactSensitiveText } from "@social-monitor/shared-kernel";

import { GITHUB_TRENDING_PAGE_PROVIDER_KEY, type GitHubTrendingPageRepositoryMetadataInput } from '../../../domain';
import { parseConfig, readWindow, readPositiveInteger } from './github-trending-page-source-config';
import {
  normalizeRepository,
  isUsableTrendingRepository,
  githubTrendingPageWarnings,
} from './github-trending-page-source-mapping';
import type {
  ProviderFailure,
  SourceCapabilityProfile,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourceProviderValidationResult,
  SourceQuery,
} from "../../../ports";
import type {
  GitHubTrendingPageClientPort,
} from "./github-trending-page-client.port";
import {
  canonicalGitHubTrendingRepositories,
  githubTrendingCanonicalBoardContentHash,
} from "./github-trending-page-canonical-board";
import {
  assertGitHubTrendingSnapshotTimeInWindow,
  githubTrendingDailySnapshotWindow,
} from "./github-trending-page-snapshot-window";

const capabilityProfile: SourceCapabilityProfile = {
  providerKey: GITHUB_TRENDING_PAGE_PROVIDER_KEY,
  displayName: "GitHub Trending Page",
  version: 1,
  productionSafe: true,
  supportedContentUnits: ["link"],
  supportedQueryModes: ["listing"],
  cursorModel: "time",
  stableIdentity: [
    "canonicalUrl",
    "providerMetadata.repository.fullName",
    "providerMetadata.trending.window",
    "providerMetadata.trending.scanJobId",
  ],
  quotaModel: "per_app",
  limitations: [
    "Uses the public GitHub Trending HTML page because GitHub does not expose an official Trending REST endpoint.",
    "Results match the page ranking at scan time, but the page algorithm is GitHub-owned and can change without notice.",
  ],
};

export class GitHubTrendingPageSourceProvider implements SourceProviderPort {
  constructor(
    private readonly client: GitHubTrendingPageClientPort,
    private readonly clock: { now(): Date },
    private readonly sourceLabel: GitHubTrendingPageRepositoryMetadataInput["trending"]["source"] = "github_trending_html",
  ) {}

  key(): string {
    return capabilityProfile.providerKey;
  }

  capabilityProfile(): SourceCapabilityProfile {
    return capabilityProfile;
  }

  validateBinding(query: SourceQuery): SourceProviderValidationResult {
    if (!capabilityProfile.supportedQueryModes.includes(query.mode)) {
      return { ok: false, reason: `Unsupported query mode: ${query.mode}` };
    }

    if (readWindow(query.query) === undefined) {
      return {
        ok: false,
        reason:
          "GitHub Trending page query must be daily, weekly, monthly, today, week or month",
      };
    }

    return { ok: true };
  }

  planScan(
    query: SourceQuery,
    context: SourceProviderScanContext,
  ): SourceProviderScanPlan {
    return {
      query,
      maxItems: readPositiveInteger(context.config?.maxItems, 25, 1, 100),
    };
  }

  async scan(
    plan: SourceProviderScanPlan,
    context: SourceProviderScanContext,
  ): Promise<SourceProviderScanResult> {
    const scanJobId = context.scanJobId.trim();
    if (scanJobId.length === 0) {
      throw new Error("GitHub Trending scan identity must be non-empty");
    }
    const config = parseConfig(plan.query, context, plan.maxItems);
    const fetchStartedAt = this.clock.now();
    const dailyWindow = githubTrendingDailySnapshotWindow({
      config: context.config,
      window: config.window,
      fetchStartedAt,
    });
    assertGitHubTrendingSnapshotTimeInWindow(
      fetchStartedAt,
      dailyWindow,
      "fetchStartedAt",
    );
    const repositories = (
      await Promise.all(
        config.languages.map((language) =>
          this.client.listTrendingRepositories({
            window: config.window,
            language,
            spokenLanguage: config.spokenLanguage,
            limit: config.maxItemsPerLanguage,
            userAgent: config.userAgent,
          }),
        ),
      )
    ).flat();
    const checkedAt = this.clock.now();
    assertGitHubTrendingSnapshotTimeInWindow(
      checkedAt,
      dailyWindow,
      "checkedAt",
    );
    if (checkedAt.getTime() < fetchStartedAt.getTime()) {
      throw new Error(
        "GitHub Trending daily checkedAt cannot precede fetchStartedAt",
      );
    }
    const validRepositories = canonicalGitHubTrendingRepositories(
      repositories.filter(isUsableTrendingRepository),
      plan.maxItems,
    );
    const snapshotContentHash =
      githubTrendingCanonicalBoardContentHash(validRepositories);

    return {
      items: validRepositories.map((repository) =>
        normalizeRepository({
          repository,
          window: config.window,
          scanJobId,
          fetchStartedAt,
          checkedAt,
          snapshotContentHash,
          source: this.sourceLabel,
        }),
      ),
      nextCursor: checkedAt.toISOString(),
      warnings: githubTrendingPageWarnings({
        fetchedCount: repositories.length,
        validCount: validRepositories.length,
      }),
    };
  }

  classifyError(error: unknown): ProviderFailure {
    const rawMessage =
      error instanceof Error
        ? error.message
        : "Unknown GitHub Trending page provider error";
    const lowerMessage = rawMessage.toLowerCase();
    const message = redactSensitiveText(rawMessage);

    if (
      rawMessage.includes("403") ||
      rawMessage.includes("429") ||
      lowerMessage.includes("rate limit")
    ) {
      return {
        kind: "rate_limited",
        retryable: true,
        message,
      };
    }

    return {
      kind: "unavailable",
      retryable: true,
      message,
    };
  }
}

