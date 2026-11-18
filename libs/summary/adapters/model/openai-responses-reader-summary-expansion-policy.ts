import type {
  ReaderSummaryCoveragePlan,
  SummaryEvidenceSelection,
} from "../../domain";
import { selectHydratableExpandedEvidenceIds } from "./openai-responses-reader-summary-expanded-candidate-selection";

const legacySourceHydrationLimit = 50_000;
const v3SourceHydrationLimit = 64_000;

// The legacy pack hydrates less text than the V3/daily pack. Do not
// apply the legacy candidate cap to an already sealed daily selection.
export const sourceHydrationLimitForSelection = (
  selection: SummaryEvidenceSelection,
): number =>
  selection.promotionV3 === undefined && selection.dailyGenerationInput === undefined
    ? legacySourceHydrationLimit : v3SourceHydrationLimit;

export const expandedEvidenceIds = (
  selection: SummaryEvidenceSelection,
  coveragePlan: ReaderSummaryCoveragePlan,
): ReadonlySet<string> => {
  if (selection.dailyGenerationInput !== undefined) return new Set(selection.dailyGenerationInput.selected.map(entry => entry.feedItemId));
  return selectHydratableExpandedEvidenceIds(
    selection,
    coveragePlan,
    sourceHydrationLimitForSelection(selection),
  );
};
