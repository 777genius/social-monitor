import { RankFeedItemsUseCase } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.use-case";
import type { RankedFeedItemView } from "@social-monitor/relevance/features/rank-feed-items/rank-feed-items.result";
import type { SummaryEvidenceItem } from "@social-monitor/summary/domain";
import { mapRankedItem } from "@social-monitor/summary/adapters/evidence/relevance-reader-summary-evidence-support";
import { selectorWiring } from "./reader-summary-new-input-refresh-selector-composition.spec-support";
import { refreshManifest } from "./reader-summary-new-input-refresh.spec-support";

// Exercise reconciliation separately from editorial display eligibility. The real
// selector must succeed with a source-bound short lead. Its excluded long/repo
// candidates are then submitted unchanged to the binding/publication-guard probe;
// this does not assert that those candidates are display-ready editorial leads.
export async function reconciliationFixture() {
  const rank = jest.spyOn(RankFeedItemsUseCase.prototype, "execute");
  const test = await selectorWiring({ displayReadyLead: true });
  return { ...test, reconciliationSelection: async () => {
    const selection = await test.selectComplete();
    expect(selection.selectedEvidence.some((item) =>
      item.feedItemId === "synthetic-extra-0" && item.readerHeadline?.status === "accepted")).toBe(true);
    const ranked = await rank.mock.results.at(-1)!.value;
    if (!ranked.ok) throw ranked.error;
    const manifest = refreshManifest();
    const candidates = ranked.value.items.map((item: RankedFeedItemView) => mapRankedItem(item,
      new Date(manifest.observedThrough), manifest));
    const evidence = [...selection.selectedEvidence, ...candidates.filter((item: SummaryEvidenceItem) =>
      !selection.selectedEvidence.some((selected) => selected.feedItemId === item.feedItemId))];
    for (const item of evidence.filter((item) => item.providerKey === "github-repo-radar")) {
      expect(item.readerHeadline).toEqual({ status: "unavailable", reasonCode: "not_assessed" });
    }
    const reconciliation = { ...selection, selectedEvidence: evidence };
    test.assessment.assertComplete(test.preflight.assessmentCandidateCount, reconciliation);
    return reconciliation;
  } };
}
