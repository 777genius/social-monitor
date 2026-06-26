import { redactSensitiveText } from '@social-monitor/shared-kernel';

import type {
  ProviderFailure,
  SourceCapabilityProfile,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourceProviderValidationResult,
  SourceQuery,
} from '../../../ports';
import type { GitHubClientPort, GitHubIssueSearchItem } from './github-client.port';

export const GITHUB_ISSUES_PROVIDER_KEY = 'github-issues';
export const LEGACY_GITHUB_ISSUES_PROVIDER_KEY = 'github';

const capabilityProfile: SourceCapabilityProfile = {
  providerKey: GITHUB_ISSUES_PROVIDER_KEY,
  displayName: 'GitHub Issues',
  version: 1,
  productionSafe: true,
  supportedContentUnits: ['post', 'comment', 'link'],
  supportedQueryModes: ['search'],
  cursorModel: 'page_token',
  stableIdentity: ['providerId', 'canonicalUrl'],
  quotaModel: 'per_app',
  limitations: [
    'Uses official GitHub REST search API for public issues. Pull requests are skipped in the MVP adapter.',
    'Unauthenticated GitHub search is rate-limited; tenant token can be supplied later through encrypted config.',
  ],
};

export class GitHubSourceProvider implements SourceProviderPort {
  constructor(private readonly client: GitHubClientPort) {}

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

    if (query.query.trim().length === 0) {
      return { ok: false, reason: 'GitHub issues search query must be non-empty' };
    }

    return { ok: true };
  }

  planScan(query: SourceQuery, context: SourceProviderScanContext): SourceProviderScanPlan {
    const maxItems = readPositiveInteger(context.config?.maxItems, 25, 1, 100);

    return {
      query,
      maxItems,
    };
  }

  async scan(plan: SourceProviderScanPlan, context: SourceProviderScanContext): Promise<SourceProviderScanResult> {
    const page = await this.client.searchIssues({
      query: plan.query.query,
      limit: plan.maxItems,
      cursor: plan.cursor,
      accessToken: readOptionalString(context.config?.accessToken)
        ?? readOptionalString(context.config?.apiToken)
        ?? readOptionalString(context.config?.bearerToken),
      userAgent: readOptionalString(context.config?.userAgent),
    });
    const normalized = page.items.flatMap((item) => normalizeIssue(item));

    return {
      items: normalized,
      nextCursor: page.nextCursor,
      warnings: page.items.length !== normalized.length
        ? ['Some GitHub issues search items were skipped because they were pull requests or incomplete.']
        : [],
    };
  }

  classifyError(error: unknown): ProviderFailure {
    const rawMessage = error instanceof Error ? error.message : 'Unknown GitHub issues provider error';
    const lowerMessage = rawMessage.toLowerCase();
    const message = redactSensitiveText(rawMessage);

    if (rawMessage.includes('401') || lowerMessage.includes('bad credentials')) {
      return {
        kind: 'auth_failed',
        retryable: false,
        message,
      };
    }

    if (rawMessage.includes('403') || rawMessage.includes('429') || lowerMessage.includes('rate limit')) {
      return {
        kind: 'rate_limited',
        retryable: true,
        message,
      };
    }

    return {
      kind: 'unavailable',
      retryable: true,
      message,
    };
  }
}

const normalizeIssue = (issue: GitHubIssueSearchItem) => {
  if (issue.isPullRequest === true || issue.htmlUrl === undefined) {
    return [];
  }

  const title = issue.title?.trim() ?? '';
  const body = issue.body?.trim() ?? '';

  if (title.length + body.length === 0) {
    return [];
  }

  return [
    {
      externalId: `github:${issue.nodeId ?? issue.id ?? issue.htmlUrl}`,
      canonicalUrl: issue.htmlUrl,
      title,
      body,
      authorHandle: issue.userLogin,
      publishedAt: readDate(issue.createdAt ?? issue.updatedAt),
    },
  ];
};

const readDate = (value: string | undefined): Date => {
  if (value === undefined) {
    return new Date(0);
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
};

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const readPositiveInteger = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`GitHub issues source config integer must be between ${min} and ${max}`);
  }

  return value;
};
