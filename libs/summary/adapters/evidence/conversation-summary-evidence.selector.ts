import type {
  ConversationSignalBaselineRepositoryPort,
  ConversationUnitRepositoryPort,
} from '@social-monitor/conversation/ports';
import type { Clock } from '@social-monitor/shared-kernel';

import type {
  SummaryEvidenceConversationContext,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
  SummaryEvidenceSelectorPort,
} from '../../ports';
import {
  ConversationEvidenceContextReader,
  type ConversationEvidenceContextReaderOptions,
} from './conversation-evidence-context.reader';

export type ConversationSummaryEvidenceSelectorOptions =
  ConversationEvidenceContextReaderOptions;

export class ConversationSummaryEvidenceSelector
  implements SummaryEvidenceSelectorPort
{
  private readonly contextReader: ConversationEvidenceContextReader;

  constructor(
    private readonly delegate: SummaryEvidenceSelectorPort,
    conversationUnits: ConversationUnitRepositoryPort,
    baselineSamples: ConversationSignalBaselineRepositoryPort,
    clock: Clock,
    options: ConversationSummaryEvidenceSelectorOptions = {},
  ) {
    this.contextReader = new ConversationEvidenceContextReader(
      conversationUnits,
      baselineSamples,
      clock,
      options,
    );
  }

  async select(
    params: Parameters<SummaryEvidenceSelectorPort['select']>[0],
  ): Promise<SummaryEvidenceSelection> {
    const selection = await this.delegate.select(params);

    if (selection.items.length === 0) {
      return selection;
    }

    const contextByRoot = await this.contextReader.readByRootFeedItemIds({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      rootFeedItemIds: selection.items.map((item) => item.feedItemId),
      interestId: params.interestId,
    });

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
