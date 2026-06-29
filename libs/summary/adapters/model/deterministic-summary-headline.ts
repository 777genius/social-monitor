import type { SummaryModelInput } from '../../ports';
import {
  providerKeyLabel,
  summarizeProviderLabels,
  uniqueStrings,
} from './summary-provider-labels';

export const buildSummaryHeadline = (
  selectedItems: SummaryModelInput['evidence']['items'],
): string => {
  const itemCount = selectedItems.length;
  const providerLabels = uniqueStrings(
    selectedItems.map((item) => providerKeyLabel(item.providerKey)),
  );

  if (itemCount === 0 || providerLabels.length === 0) {
    return 'Interest summary';
  }

  const itemLabel = itemCount === 1 ? 'item' : 'items';
  const sourceLabel = providerLabels.length === 1 ? 'source' : 'sources';

  return `Interest summary: ${itemCount} ${itemLabel} across ${providerLabels.length} ${sourceLabel} (${summarizeProviderLabels(providerLabels)})`;
};
