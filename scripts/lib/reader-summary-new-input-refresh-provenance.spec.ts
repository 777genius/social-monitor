import { selectorWiring } from "./reader-summary-new-input-refresh-selector-composition.spec-support";
import { publicationProbe } from "./reader-summary-new-input-refresh-model-composition.spec-support";
afterEach(() => jest.restoreAllMocks());
it.each(["github-repo-radar", "github-trending-page"])("rejects unknown identity plus asserted %s provenance", async (providerKey) => {
  const test = await selectorWiring();
  const selection = await test.selectComplete();
  const original = selection.selectedEvidence[0]!;
  const forgedItem = { ...original,
    feedItemId: "never-reviewed", sourceItemId: "never-reviewed-source",
    sourceBindingId: "never-reviewed-binding", interestId: "never-reviewed-interest",
    providerKey, canonicalUrl: "https://github.com/synthetic/unreviewed",
    title: "Unreviewed replacement title", bodyPreview: "An unreviewed replacement claim.",
    promotionFacts: { ...original.promotionFacts,
      contentKind: providerKey === "github-repo-radar" ? "repository" : "github_trending",
      metricsState: "observed", metrics: { provider: "github_radar" } },
    contentQuality: { ...original.contentQuality!, reason: "High-context source" },
  } as typeof original;
  const forged = { ...selection, selectedEvidence: [forgedItem] };
  expect(() => test.assessment.assertComplete(2, forged)).toThrow(/reconciliation/u);
  expect(() => test.runtime.assertUsable()).toThrow(/reconciliation/u);
  const publication = publicationProbe(test.runtime, forged);
  await expect(publication.attempt()).rejects.toThrow(/reconciliation/u);
  expect(publication.publish).not.toHaveBeenCalled();
});
