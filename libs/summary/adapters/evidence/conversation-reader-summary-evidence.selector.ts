import type { SummaryEvidenceItem, SummaryEvidenceSelection } from '../../domain';
import type { ReaderSummaryEvidenceSelectorPort } from '../../ports';
import { ConversationEvidenceContextReader } from './conversation-evidence-context.reader';

export class ConversationReaderSummaryEvidenceSelector
  implements ReaderSummaryEvidenceSelectorPort
{
  constructor(
    private readonly delegate: ReaderSummaryEvidenceSelectorPort,
    private readonly contextReader: ConversationEvidenceContextReader,
  ) {}

  async select(
    params: Parameters<ReaderSummaryEvidenceSelectorPort['select']>[0],
  ): Promise<SummaryEvidenceSelection> {
    const selection = await this.delegate.select(params);

    if (selection.selectedEvidence.length === 0) {
      return selection;
    }

    const contextByRoot = await this.contextReader.readByRootFeedItemIds({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      interestId: interestIdForConversationContext(params.scope, selection),
      rootFeedItemIds: selection.selectedEvidence.map((item) => item.feedItemId),
    });

    if (contextByRoot.size === 0) {
      return selection;
    }

    return {
      ...selection,
      selectedEvidence: selection.selectedEvidence.map((item) =>
        attachConversationContext(item, contextByRoot.get(item.feedItemId)),
      ),
    };
  }
}

const attachConversationContext = (
  item: SummaryEvidenceItem,
  context: SummaryEvidenceItem['conversationContext'] | undefined,
): SummaryEvidenceItem =>
  context === undefined
    ? item
    : {
        ...item,
        conversationContext: context,
      };

const interestIdForConversationContext = (
  scope: Parameters<ReaderSummaryEvidenceSelectorPort['select']>[0]['scope'],
  selection: SummaryEvidenceSelection,
): string => {
  if (scope.type === 'interest') {
    return scope.interestId;
  }

  return selection.selectedEvidence[0]?.interestId ?? 'workspace';
};
