import {
  type ConversationBundleAncestorUnit,
  ConversationBundleBuilder,
  type ConversationBundleUnit,
} from '@social-monitor/conversation/domain';
import type {
  ConversationSignalBaselineRepositoryPort,
  ConversationUnitRepositoryPort,
} from '@social-monitor/conversation/ports';
import type { Clock, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type {
  SummaryEvidenceConversationAncestor,
  SummaryEvidenceConversationContext,
  SummaryEvidenceConversationUnit,
} from '../../domain';

export type ConversationEvidenceContextReaderOptions = {
  readonly readLimitPerRoot?: number;
  readonly promptLimitPerRoot?: number;
  readonly baselineLookbackDays?: number;
  readonly baselineSampleLimit?: number;
  readonly maxBodyCharacters?: number;
  readonly maxAncestorDepth?: number;
  readonly maxAncestorBodyCharacters?: number;
  readonly maxTotalConversationUnitsPerRoot?: number;
};

type ResolvedConversationEvidenceContextReaderOptions =
  Required<ConversationEvidenceContextReaderOptions>;

const defaultOptions: ResolvedConversationEvidenceContextReaderOptions = {
  readLimitPerRoot: 50,
  promptLimitPerRoot: 7,
  baselineLookbackDays: 30,
  baselineSampleLimit: 2_000,
  maxBodyCharacters: 700,
  maxAncestorDepth: 3,
  maxAncestorBodyCharacters: 300,
  maxTotalConversationUnitsPerRoot: 14,
};

export class ConversationEvidenceContextReader {
  private readonly builder = new ConversationBundleBuilder();

  constructor(
    private readonly conversationUnits: ConversationUnitRepositoryPort,
    private readonly baselineSamples: ConversationSignalBaselineRepositoryPort,
    private readonly clock: Clock,
    private readonly options: ConversationEvidenceContextReaderOptions = {},
  ) {}

  async readByRootFeedItemIds(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly interestId: string;
    readonly rootFeedItemIds: readonly string[];
  }): Promise<ReadonlyMap<string, SummaryEvidenceConversationContext>> {
    const rootFeedItemIds = uniqueNonEmpty(params.rootFeedItemIds);
    if (rootFeedItemIds.length === 0) {
      return new Map();
    }

    const options = { ...defaultOptions, ...this.options };
    const units = await this.conversationUnits.listByRootFeedItemIds({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      rootFeedItemIds,
      limitPerRoot: options.readLimitPerRoot,
    });

    if (units.length === 0) {
      return new Map();
    }

    const now = this.clock.now();
    const baselines = await this.baselineSamples.listSamples({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      interestId: params.interestId,
      observedAfter: new Date(
        now.getTime() - options.baselineLookbackDays * 24 * 60 * 60 * 1000,
      ),
      limit: options.baselineSampleLimit,
    });
    const bundles = this.builder.build({
      units,
      baselineSamples: baselines,
      now,
      limitPerRoot: options.promptLimitPerRoot,
      maxAncestorDepth: options.maxAncestorDepth,
      maxTotalUnitsPerRoot: options.maxTotalConversationUnitsPerRoot,
    });

    return new Map(
      bundles
        .filter((bundle) => bundle.units.length > 0)
        .map((bundle) => [
          bundle.rootFeedItemId,
          toConversationContext(bundle.bundleScore, bundle.units, options),
        ] as const),
    );
  }
}

const toConversationContext = (
  bundleScore: number,
  units: readonly ConversationBundleUnit[],
  options: ResolvedConversationEvidenceContextReaderOptions,
): SummaryEvidenceConversationContext => ({
  rankingBasis: 'cohort_baseline_v1',
  bundleScore,
  units: units.map((unit) => toConversationUnit(unit, options)),
});

const toConversationUnit = (
  unit: ConversationBundleUnit,
  options: ResolvedConversationEvidenceContextReaderOptions,
): SummaryEvidenceConversationUnit => ({
  conversationUnitId: unit.conversationUnitId,
  providerUnitId: unit.providerUnitId,
  parentProviderUnitId: unit.parentProviderUnitId,
  threadExternalId: unit.threadExternalId,
  canonicalUrl: unit.canonicalUrl,
  authorHandle: unit.authorHandle,
  body: truncateForPrompt(unit.body, options.maxBodyCharacters),
  score: unit.normalizedSignal.score,
  providerScore: readProviderScore(unit.providerMetrics),
  replyCount: readReplyCount(unit.providerMetrics),
  signalBand: unit.normalizedSignal.band,
  depth: unit.depth,
  role: unit.role,
  selectionReason: unit.selectionReason,
  ancestry:
    unit.ancestry.length === 0
      ? undefined
      : unit.ancestry.map((ancestor) =>
          toConversationAncestor(ancestor, options),
        ),
  publishedAt: unit.publishedAt.toISOString(),
});

const toConversationAncestor = (
  unit: ConversationBundleAncestorUnit,
  options: ResolvedConversationEvidenceContextReaderOptions,
): SummaryEvidenceConversationAncestor => ({
  conversationUnitId: unit.conversationUnitId,
  providerUnitId: unit.providerUnitId,
  parentProviderUnitId: unit.parentProviderUnitId,
  threadExternalId: unit.threadExternalId,
  canonicalUrl: unit.canonicalUrl,
  authorHandle: unit.authorHandle,
  body: truncateForPrompt(unit.body, options.maxAncestorBodyCharacters),
  score: unit.normalizedSignal.score,
  providerScore: readProviderScore(unit.providerMetrics),
  replyCount: readReplyCount(unit.providerMetrics),
  signalBand: unit.normalizedSignal.band,
  depth: unit.depth,
  role: unit.role,
  selectionReason: unit.selectionReason,
  publishedAt: unit.publishedAt.toISOString(),
});

const truncateForPrompt = (value: string, maxLength: number): string => {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

const readProviderScore = (
  metrics: ConversationBundleUnit['providerMetrics'],
): number | undefined =>
  metrics.kind === 'reddit_comment' ? metrics.score : undefined;

const readReplyCount = (
  metrics: ConversationBundleUnit['providerMetrics'],
): number | undefined =>
  metrics.kind === 'reddit_comment' ? metrics.replies : undefined;

const uniqueNonEmpty = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
};
