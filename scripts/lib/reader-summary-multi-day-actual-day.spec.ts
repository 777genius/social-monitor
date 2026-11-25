import type {
  ReaderSummaryCitation,
  ReaderSummaryNarrativeSection,
} from "@social-monitor/summary/domain";

import { isCanonicalSupplementalTrendNarrativeSection } from "./reader-summary-multi-day-actual-day";

describe("reader-summary multi-day actual-day projection", () => {
  it("recognizes only the canonical supplemental GitHub Trending watch section", () => {
    const citation = githubCitation();
    const citationById = new Map([[citation.citationId, citation]]);
    const canonicalSection = githubWatchSection();

    expect(
      isCanonicalSupplementalTrendNarrativeSection({
        section: canonicalSection,
        citationById,
      }),
    ).toBe(true);
    expect(
      isCanonicalSupplementalTrendNarrativeSection({
        section: { ...canonicalSection, id: "ordinary-watch" },
        citationById,
      }),
    ).toBe(false);
    expect(
      isCanonicalSupplementalTrendNarrativeSection({
        section: { ...canonicalSection, storyClusterId: "cluster-1" },
        citationById,
      }),
    ).toBe(false);
  });

  it("fails closed for unresolved or mixed supplemental citations", () => {
    const github = githubCitation();
    const ordinary: ReaderSummaryCitation = {
      ...github,
      citationId: "citation-hn",
      feedItemId: "feed-hn",
      providerKey: "hacker-news",
    };
    const section = githubWatchSection();

    expect(
      isCanonicalSupplementalTrendNarrativeSection({
        section,
        citationById: new Map(),
      }),
    ).toBe(false);
    expect(
      isCanonicalSupplementalTrendNarrativeSection({
        section: {
          ...section,
          citationIds: [github.citationId, ordinary.citationId],
        },
        citationById: new Map([
          [github.citationId, github],
          [ordinary.citationId, ordinary],
        ]),
      }),
    ).toBe(false);
    expect(
      isCanonicalSupplementalTrendNarrativeSection({
        section: {
          ...section,
          citationIds: [github.citationId, github.citationId],
        },
        citationById: new Map([[github.citationId, github]]),
      }),
    ).toBe(false);
    expect(
      isCanonicalSupplementalTrendNarrativeSection({
        section: {
          ...section,
          citationIds: [github.citationId, "citation-github-duplicate-item"],
        },
        citationById: new Map([
          [github.citationId, github],
          [
            "citation-github-duplicate-item",
            { ...github, citationId: "citation-github-duplicate-item" },
          ],
        ]),
      }),
    ).toBe(false);
  });
});

function githubWatchSection(): ReaderSummaryNarrativeSection {
  return {
    id: "github-trending",
    kind: "watch",
    title: "GitHub Trending",
    text: "- **example/project**: +1,234 stars today.",
    citationIds: ["citation-github"],
  };
}

function githubCitation(): ReaderSummaryCitation {
  return {
    citationId: "citation-github",
    feedItemId: "feed-github",
    sourceItemId: "source-github",
    providerKey: "github-trending-page",
    field: "title",
    canonicalUrl: "https://github.com/example/project",
  };
}
