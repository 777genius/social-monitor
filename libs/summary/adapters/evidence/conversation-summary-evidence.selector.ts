import {
  ConversationBundleBuilder,
  type ConversationBundleUnit,
} from '@social-monitor/conversation/domain';
import type {
  ConversationSignalBaselineRepositoryPort,
  ConversationUnitRepositoryPort,
} from '@social-monitor/conversation/ports';
import type { Clock } from '@social-monitor/shared-kernel';

import type {
  SummaryEvidenceConversationContext,
  SummaryEvidenceConversationUnit,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
  SummaryEvidenceSelectorPort,
} from '../../ports';

export type ConversationSummaryEvidenceSelectorOptions = {
  readonly readLimitPerRoot?: number;
  readonly promptLimitPerRoot?: number;
  readonly baselineLookbackDays?: number;
  readonly baselineSampleLimit?: number;
  readonly maxBodyCharacters?: number;
};

type ResolvedConversationSummaryEvidenceSelectorOptions = Required<ConversationSummaryEvidenceSelectorOptions>;

const defaultOptions: ResolvedConversationSummaryEvidenceSelectorOptions = {
  readLimitPerRoot: 20,
  promptLimitPerRoot: 7,
  baselineLookbackDays: 30,
  baselineSampleLimit: 2_000,
  maxBodyCharacters: 700,
};

export class ConversationSummaryEvidenceSelector
  implements SummaryEvidenceSelectorPort
{
  private readonly builder = new ConversationBundleBuilder();

  constructor(
    private readonly delegate: SummaryEvidenceSelectorPort,
    private readonly conversationUnits: ConversationUnitRepositoryPort,
    private readonly baselineSamples: ConversationSignalBaselineRepositoryPort,
    private readonly clock: Clock,
    private readonly options: ConversationSummaryEvidenceSelectorOptions = {},
  ) {}

  async select(
    params: Parameters<SummaryEvidenceSelectorPort['select']>[0],
  ): Promise<SummaryEvidenceSelection> {
    const selection = await this.delegate.select(params);

    if (selection.items.length === 0) {
      return selection;
    }

    const options = { ...defaultOptions, ...this.options };
    const units = await this.conversationUnits.listByRootFeedItemIds({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      rootFeedItemIds: selection.items.map((item) => item.feedItemId),
      limitPerRoot: options.readLimitPerRoot,
    });

    if (units.length === 0) {
      return selection;
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
    });
    const contextByRoot = new Map(
      bundles
        .filter((bundle) => bundle.units.length > 0)
        .map((bundle) => [
          bundle.rootFeedItemId,
          toConversationContext(bundle.bundleScore, bundle.units, options),
        ] as const),
    );

    return {
      ...selection,
      items: selection.items.map((item) =>
        attachConversationContext(item, contextByRoot.get(item.feedItemId)),
      ),
    };
  }
}

const attachConversationContext = (
  item: SummaryEvidenceItem,
  context: SummaryEvidenceConversationContext | undefined,
): SummaryEvidenceItem =>
  context === undefined
    ? item
    : {
        ...item,
        conversationContext: context,
      };

const toConversationContext = (
  bundleScore: number,
  units: readonly ConversationBundleUnit[],
  options: ResolvedConversationSummaryEvidenceSelectorOptions,
): SummaryEvidenceConversationContext => ({
  rankingBasis: 'cohort_baseline_v1',
  bundleScore,
  units: units.map((unit) => toConversationUnit(unit, options)),
});

const toConversationUnit = (
  unit: ConversationBundleUnit,
  options: ResolvedConversationSummaryEvidenceSelectorOptions,
): SummaryEvidenceConversationUnit => ({
  conversationUnitId: unit.conversationUnitId,
  providerUnitId: unit.providerUnitId,
  canonicalUrl: unit.canonicalUrl,
  authorHandle: unit.authorHandle,
  body: truncateForPrompt(unit.body, options.maxBodyCharacters),
  score: unit.normalizedSignal.score,
  providerScore: readProviderScore(unit.providerMetrics),
  replyCount: readReplyCount(unit.providerMetrics),
  signalBand: unit.normalizedSignal.band,
  depth: unit.depth,
  role: unit.role,
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
