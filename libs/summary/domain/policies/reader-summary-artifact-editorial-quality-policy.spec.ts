import { READER_SUMMARY_DAILY_INPUT_POLICY } from "../value-objects/reader-summary-daily-generation-input";
import {
  evaluateReaderSummaryArtifactEditorialQuality,
  type ReaderSummaryArtifactEditorialQualityInput,
  type ReaderSummaryEditorialNarrativeSection,
} from "./reader-summary-artifact-editorial-quality-policy";

describe("evaluateReaderSummaryArtifactEditorialQuality", () => {
  it("does not classify empty normalized titles as headline copies", () => {
    const result = evaluateReaderSummaryArtifactEditorialQuality({
      ...dailySynthesis(),
      headline: "!!!",
      topPostTitles: ["!!!", "", "   "],
    });
    expect(result.qualityGates.headlineIsNotCopiedFromTopPost).toBe(true);
  });

  it("accepts a balanced multi-cluster daily synthesis", () => {
    const result =
      evaluateReaderSummaryArtifactEditorialQuality(dailySynthesis());

    expect(result).toMatchObject({
      blockingPassed: true,
      metrics: {
        leadCount: 1,
        leadClusterCount: 2,
        leadProviderCount: 2,
        secondarySignalCount: 2,
        unresolvedCitationCount: 0,
        mainNarrativeProviderCount: 3,
        dominantProviderShare: 0.5,
        malformedMarkdownPatternCount: 0,
      },
    });
  });

  it("requires exactly one lead", () => {
    const input = dailySynthesis();
    const result = evaluateReaderSummaryArtifactEditorialQuality({
      ...input,
      narrativeSections: [
        ...input.narrativeSections,
        section({ kind: "lead", citationIds: ["c3", "c4"] }),
      ],
    });

    expect(result.qualityGates.exactlyOneLead).toBe(false);
    expect(result.issues).toContain(
      "Expected exactly one narrative lead, found 2",
    );
  });

  it("rejects a daily synthesis whose lead covers one cluster and provider", () => {
    const input = dailySynthesis();
    const result = evaluateReaderSummaryArtifactEditorialQuality({
      ...input,
      narrativeSections: input.narrativeSections.map((item) =>
        item.kind === "lead" ? { ...item, citationIds: ["c1"] } : item,
      ),
    });

    expect(result.qualityGates).toMatchObject({
      dailySynthesisLeadHasMultipleClusters: false,
      dailySynthesisLeadHasMultipleProviders: false,
    });
  });

  it("rejects duplicate secondary clusters and unresolved citations", () => {
    const input = dailySynthesis();
    const result = evaluateReaderSummaryArtifactEditorialQuality({
      ...input,
      narrativeSections: [
        input.narrativeSections[0]!,
        section({
          kind: "secondary_signal",
          storyClusterId: "cluster-routing",
          citationIds: ["missing"],
        }),
        section({
          kind: "secondary_signal",
          storyClusterId: "cluster-routing",
          citationIds: ["c2"],
        }),
      ],
    });

    expect(result.qualityGates).toMatchObject({
      secondarySignalsUseUniqueClusters: false,
      narrativeCitationsResolve: false,
    });
    expect(result.issues).toContain(
      "Narrative citation does not resolve: missing",
    );
  });

  it.each([
    "Hacker News discussion: Clawk gives agents disposable VMs",
    "HN: Clawk gives agents disposable VMs",
    "Reddit discusses Claude subscription limits",
    "X/Twitter chatter says developers are switching models",
  ])("rejects provider-first headline framing: %s", (headline) => {
    const result = evaluateReaderSummaryArtifactEditorialQuality({
      ...dailySynthesis(),
      headline,
    });

    expect(result.qualityGates.headlineIsNotProviderPrefixed).toBe(false);
  });

  it("rejects a headline copied from a top post after normalization", () => {
    const result = evaluateReaderSummaryArtifactEditorialQuality({
      ...dailySynthesis(),
      headline: "**Clawk gives coding agents disposable Linux VMs.**",
      topPostTitles: ["Clawk gives coding agents disposable Linux VMs"],
    });

    expect(result.qualityGates.headlineIsNotCopiedFromTopPost).toBe(false);
  });

  it("rejects daily synthesis provider dominance above 75 percent", () => {
    const input = dailySynthesis();
    const result = evaluateReaderSummaryArtifactEditorialQuality({
      ...input,
      citations: [
        citation("c1", "hacker-news", "cluster-clawk"),
        citation("c2", "x-twitter", "cluster-routing"),
        citation("c3", "hacker-news", "cluster-security"),
        citation("c4", "hacker-news", "cluster-research"),
        citation("c5", "hacker-news", "cluster-pricing"),
      ],
      narrativeSections: [
        section({ kind: "lead", citationIds: ["c1", "c2"] }),
        section({
          kind: "secondary_signal",
          storyClusterId: "cluster-security",
          citationIds: ["c3"],
        }),
        section({
          kind: "secondary_signal",
          storyClusterId: "cluster-research",
          citationIds: ["c4"],
        }),
        section({ kind: "why_it_matters", citationIds: ["c5"] }),
      ],
    });

    expect(result.metrics.dominantProviderShare).toBe(0.8);
    expect(result.qualityGates.mainNarrativeProviderDominanceControlled).toBe(
      false,
    );
  });

  it("allows a single-provider single story when the lead is honestly cluster-bound", () => {
    const result = evaluateReaderSummaryArtifactEditorialQuality({
      headline: "Clawk isolates coding agents from developer laptops",
      coverageMode: "single_story",
      topPostTitles: ["Show HN: Clawk"],
      citations: [citation("c1", "hacker-news", "cluster-clawk")],
      narrativeSections: [
        section({
          kind: "lead",
          storyClusterId: "cluster-clawk",
          citationIds: ["c1"],
        }),
      ],
      renderedMarkdown: "Clawk runs coding agents in disposable Linux VMs.",
    });

    expect(result.blockingPassed).toBe(true);
    expect(result.metrics.dominantProviderShare).toBe(1);
  });

  it("rejects a single story used as a diversity bypass", () => {
    const result = evaluateReaderSummaryArtifactEditorialQuality({
      ...dailySynthesis(),
      coverageMode: "single_story",
      narrativeSections: [
        section({
          kind: "lead",
          storyClusterId: "cluster-clawk",
          citationIds: ["c1", "c2"],
        }),
      ],
    });

    expect(result.qualityGates.singleStoryLeadIsHonestlyClusterBound).toBe(
      false,
    );
  });

  it.each([
    {
      label: "inline Watch bullet",
      markdown: "- **Watch:** - **OpenCut**: +1,229 stars today.",
      issue: "Rendered Markdown contains an inline nested Watch bullet",
    },
    {
      label: "unbalanced bold",
      markdown: "**Other signals today",
      issue: "Rendered Markdown contains unbalanced bold delimiters",
    },
    {
      label: "HTML",
      markdown: "Signals <strong>today</strong>",
      issue: "Rendered Markdown contains an HTML tag",
    },
    {
      label: "table",
      markdown: "| Signal | Score |\n| --- | --- |\n| Clawk | 2.1 |",
      issue: "Rendered Markdown contains a table",
    },
  ])("rejects malformed Markdown: $label", ({ markdown, issue }) => {
    const result = evaluateReaderSummaryArtifactEditorialQuality({
      ...dailySynthesis(),
      renderedMarkdown: markdown,
    });

    expect(result.qualityGates.renderedMarkdownIsWellFormed).toBe(false);
    expect(result.issues).toContain(issue);
  });
});

describe("native likes input editorial grounding", () => {
  const sameProvider = (): ReaderSummaryArtifactEditorialQualityInput => ({
    ...dailySynthesis(), coveragePolicyVersion: READER_SUMMARY_DAILY_INPUT_POLICY,
    citations: dailySynthesis().citations.map(item => ({ ...item, providerKey: "reddit" })),
  });
  it("accepts distinct grounded events without a provider diversity or dominance quota", () => {
    const result = evaluateReaderSummaryArtifactEditorialQuality(sameProvider());
    expect(result.blockingPassed).toBe(true);
    expect(result.metrics).toMatchObject({ leadClusterCount: 2, leadProviderCount: 1, dominantProviderShare: 1 });
    const legacy = evaluateReaderSummaryArtifactEditorialQuality({ ...sameProvider(), coveragePolicyVersion: undefined });
    expect(legacy.qualityGates.dailySynthesisLeadHasMultipleProviders).toBe(false);
    expect(legacy.qualityGates.mainNarrativeProviderDominanceControlled).toBe(false);
  });
  it("still rejects a one-event daily synthesis", () => {
    const input = sameProvider();
    const result = evaluateReaderSummaryArtifactEditorialQuality({ ...input,
      narrativeSections: input.narrativeSections.map(item => item.kind === "lead" ? { ...item, citationIds: ["c1"] } : item) });
    expect(result.blockingPassed).toBe(false);
    expect(result.qualityGates.dailySynthesisLeadHasMultipleClusters).toBe(false);
  });
  it("retains citation, headline and markdown protections", () => {
    const input = sameProvider();
    const result = evaluateReaderSummaryArtifactEditorialQuality({ ...input,
      headline: input.topPostTitles[0]!, renderedMarkdown: "<table>unsafe</table>",
      narrativeSections: [...input.narrativeSections, section({ kind: "secondary_signal", citationIds: ["missing"] })] });
    expect(result.blockingPassed).toBe(false);
    expect(result.qualityGates).toMatchObject({ narrativeCitationsResolve: false,
      headlineIsNotCopiedFromTopPost: false, renderedMarkdownIsWellFormed: false });
  });
});

const dailySynthesis = (): ReaderSummaryArtifactEditorialQualityInput => ({
  headline: "AI coding workflows widen as cost and isolation shape adoption",
  coverageMode: "daily_synthesis",
  topPostTitles: [
    "Show HN: Clawk - Give coding agents a disposable Linux VM",
    "Developers route models across coding-agent tools",
  ],
  citations: [
    citation("c1", "hacker-news", "cluster-clawk"),
    citation("c2", "x-twitter", "cluster-routing"),
    citation("c3", "hacker-news", "cluster-security"),
    citation("c4", "reddit", "cluster-pricing"),
  ],
  narrativeSections: [
    section({ kind: "lead", citationIds: ["c1", "c2"] }),
    section({
      kind: "secondary_signal",
      storyClusterId: "cluster-security",
      citationIds: ["c3"],
    }),
    section({
      kind: "secondary_signal",
      storyClusterId: "cluster-pricing",
      citationIds: ["c4"],
    }),
  ],
  renderedMarkdown:
    "Coding-agent workflows are expanding across isolation and model routing.\n\n" +
    "**Other signals today**\n\n" +
    "- **Security:** Isolation remains important.\n\n" +
    "- **Pricing:** Subscription limits shape adoption.",
});

const citation = (
  citationId: string,
  providerKey: string,
  storyClusterId: string,
) => ({ citationId, providerKey, storyClusterId });

const section = (
  params: Pick<ReaderSummaryEditorialNarrativeSection, "kind" | "citationIds"> &
    Partial<
      Pick<
        ReaderSummaryEditorialNarrativeSection,
        "storyClusterId" | "title" | "text"
      >
    >,
): ReaderSummaryEditorialNarrativeSection => ({
  kind: params.kind,
  title: params.title ?? "Reader-facing signal",
  text: params.text ?? "A grounded explanation of why this signal matters.",
  citationIds: params.citationIds,
  ...(params.storyClusterId === undefined
    ? {}
    : { storyClusterId: params.storyClusterId }),
});

it("uses the shared v2 synthesis proof while retaining the legacy single-story and cluster gates", () => {
  const sections = [{kind:"lead" as const,title:"Today's picture",text:"Several reports expose complementary capabilities and constraints.",citationIds:["c1","c2"]},
    ...Array.from({length:4},(_,index)=>({kind:"secondary_signal" as const,title:`Takeaway ${index}`,text:"These reports support a bounded practical comparison with explicit uncertainty.",citationIds:["c1","c2"]}))];
  const selected=[{feedItemId:"f1",storyId:"s1"},{feedItemId:"f2",storyId:"s2"}];
  const citations=selected.map((post,index)=>({citationId:`c${index+1}`,feedItemId:post.feedItemId,sourceItemId:`source${index}`,providerKey:"reddit",field:"bodyPreview" as const}));
  const plan={version:"reader_summary.daily_editorial.v2" as const,topics:selected.map((post,index)=>({title:`Event ${index}`,why:"Supported event",depth:index===0?"detailed" as const:"brief" as const,feedItemIds:[post.feedItemId]}))};
  const input:ReaderSummaryArtifactEditorialQualityInput={headline:"Tools expose practical capabilities and constraints",coverageMode:"single_story",dailyEditorialPlan:true,
    coveragePolicyVersion:READER_SUMMARY_DAILY_INPUT_POLICY,topPostTitles:[],narrativeSections:sections,renderedMarkdown:"Grounded complete paragraphs.",
    citations:citations.map((citation,index)=>({...citation,storyClusterId:`s${index+1}`})),synthesisProof:{plan,selected,citations}};
  expect(evaluateReaderSummaryArtifactEditorialQuality(input).blockingPassed).toBe(true);
  const legacy=evaluateReaderSummaryArtifactEditorialQuality({...input,synthesisProof:undefined});
  expect(legacy.qualityGates.secondarySignalsUseUniqueClusters).toBe(false);
  expect(legacy.qualityGates.singleStoryLeadIsHonestlyClusterBound).toBe(false);
  for(const ids of [["c1"],["c1","missing"],["c1","c1"]]) {
    const invalid=evaluateReaderSummaryArtifactEditorialQuality({...input,narrativeSections:[{...sections[0]!,citationIds:ids},...sections.slice(1)]});
    expect(invalid.blockingPassed).toBe(false);
  }
});
