import type { ReaderSummaryStoryRelationVerifierInput,
  ReaderSummaryStoryRelationVerifierPort } from "../../ports";
import { candidate, id, TestPresentation, workspaceSetup } from
  "./relevance-reader-summary-v3-promotion.fixture";

// Headlines from the retained Oct 25 capture; URLs, IDs and bodies are synthetic.
const elvis = [
  "Elvis Presley rights holder sues Anthropic, says Claude trained on unauthorized songs - Yahoo",
  "Elvis Presley’s rights holders sue Anthropic saying it trained AI on his music - NBC News",
  "Owners of Elvis Presley’s Music Sue Anthropic for Copyright Infringement - The New York Times",
];
const news = (title: string, index: number) => ({
  ...candidate(index + 1, "useful", "relevant"), provider: "rss", title,
  canonicalIdentity: `https://news.google.com/rss/articles/fixture-${index}`,
  body: `<a href="https://news.google.com/rss/articles/opaque-${index}">${title}</a>`,
});
const approved = (input: ReaderSummaryStoryRelationVerifierInput) => input.candidates
  .map((pair) => ({ leftFeedItemId: pair.leftFeedItemId,
    rightFeedItemId: pair.rightFeedItemId, sameStory: true, confidenceScore: 0.99,
    rationale: "Both headlines report the same filing by the same parties." }));
const setup = (titles: readonly string[], verifier?: ReaderSummaryStoryRelationVerifierPort) =>
  workspaceSetup(titles.map(news), undefined, new TestPresentation(), 2, verifier);
const build = (fixture: ReturnType<typeof setup>) => fixture.subject.build({
  job: fixture.job, manifest: fixture.manifest });

describe("V3 verified independent news stories", () => {
  it("asks about the Elvis paraphrases and publishes one story with every duplicate retained", async () => {
    const verify = jest.fn(async (input: ReaderSummaryStoryRelationVerifierInput) => approved(input));
    const fixture = setup(elvis, { verify });
    const result = await build(fixture);
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0]![0]).toMatchObject({ verificationLane: "independent_news",
      timeoutMs: 90_000 });
    expect(verify.mock.calls[0]![0].candidates).toHaveLength(3);
    expect(result.evidence.promotionV3?.news).toHaveLength(1);
    const cluster = result.evidence.clusters[0]!;
    expect([cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds].sort())
      .toEqual([id(1), id(2), id(3)]);
    expect(cluster.interestIds).toEqual([id(903), id(904)]);
  });

  it("verifies each member needed to extend an existing deterministic cluster", async () => {
    const titles = [...elvis, elvis[0]!.replace(" - Yahoo", " - Fixture Wire")];
    const verify = jest.fn(async (input: ReaderSummaryStoryRelationVerifierInput) => approved(input));
    const result = await build(setup(titles, { verify }));
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(result.evidence.promotionV3?.news).toHaveLength(1);
    expect(result.evidence.clusters[0]!.duplicateFeedItemIds).toHaveLength(3);
    expect(verify.mock.calls[0]![0].candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ leftFeedItemId: id(2), rightFeedItemId: id(4) }),
      expect.objectContaining({ leftFeedItemId: id(3), rightFeedItemId: id(4) }),
    ]));
  });

  it("keeps deterministic identities when the verifier is unavailable", async () => {
    const result = await build(setup(elvis));
    expect(result.kind).toBe("ready");
    if (result.kind === "ready") expect(result.evidence.promotionV3?.news).toHaveLength(3);
  });

  it("merges the Texas filing but keeps a different plaintiff's OpenAI lawsuit", async () => {
    const verify = jest.fn(async (input: ReaderSummaryStoryRelationVerifierInput) =>
      approved(input).map((decision) => ({ ...decision,
        sameStory: [decision.leftFeedItemId, decision.rightFeedItemId]
          .every((value) => value !== id(3)) })));
    const fixture = setup([
      "Texas attorney general sues OpenAI over deceptive practices and AI chatbot dangers - Yahoo",
      "Texas AG Ken Paxton sues ChatGPT maker OpenAI - The Texas Tribune",
      "California sues OpenAI over privacy violations - Fixture Daily",
    ], { verify });
    const result = await build(fixture);
    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") return;
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0]![0].candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ leftFeedItemId: id(1), rightFeedItemId: id(2) }),
    ]));
    expect(result.evidence.promotionV3?.news).toHaveLength(2);
    expect(result.evidence.clusters.some((cluster) =>
      [cluster.representativeFeedItemId, ...cluster.duplicateFeedItemIds].sort().join() ===
        [id(1), id(2)].join())).toBe(true);
  });

  it.each(["throws", "missing", "duplicate", "low_confidence"] as const)(
    "does not suppress stories after a %s verifier outcome", async (failure) => {
      const fixture = setup(elvis, { verify: async (input) => {
        if (failure === "throws") throw new Error("fixture verifier unavailable");
        const decisions = approved(input);
        if (failure === "missing") return decisions.slice(1);
        if (failure === "duplicate") return [...decisions, decisions[0]];
        return decisions.map((decision) => ({ ...decision, confidenceScore: 0.8 }));
      } });
      const result = await build(fixture);
      expect(result.kind).toBe("ready");
      if (result.kind === "ready") expect(result.evidence.promotionV3?.news).toHaveLength(3);
    });

  it("keeps story membership and selection stable when manifest order changes", async () => {
    const verifier = { verify: async (input: ReaderSummaryStoryRelationVerifierInput) => approved(input) };
    const first = await build(setup(elvis, verifier));
    const posts = elvis.map(news).reverse();
    const second = await build(workspaceSetup(posts, undefined, new TestPresentation(), 2, verifier));
    expect(first.kind).toBe("ready");
    expect(second.kind).toBe("ready");
    if (first.kind !== "ready" || second.kind !== "ready") return;
    const memberships = (clusters: typeof first.evidence.clusters) => clusters.map((cluster) =>
      ({ ...cluster, duplicateFeedItemIds: [...cluster.duplicateFeedItemIds].sort() }));
    expect(memberships(first.evidence.clusters)).toEqual(memberships(second.evidence.clusters));
    expect(first.evidence.promotionV3?.news.map((value) => value.candidateId))
      .toEqual(second.evidence.promotionV3?.news.map((value) => value.candidateId));
  });

  it("requires every cluster member pair instead of transitive verifier approval", async () => {
    const result = await build(setup(elvis, { verify: async (input) =>
      approved(input).map((decision) => ({ ...decision, sameStory:
        !(decision.leftFeedItemId === id(1) && decision.rightFeedItemId === id(3)) })) }));
    expect(result.kind).toBe("ready");
    if (result.kind === "ready") {
      expect(result.evidence.promotionV3?.news).toHaveLength(2);
      expect(result.evidence.clusters.every((cluster) =>
        cluster.duplicateFeedItemIds.length <= 1)).toBe(true);
    }
  });

  it("bounds one verifier request to 64 news stories and 32 pairs", async () => {
    const verify = jest.fn(async (input: ReaderSummaryStoryRelationVerifierInput) =>
      approved(input).map((decision) => ({ ...decision, sameStory: false })));
    const titles = Array.from({ length: 80 }, (_, index) =>
      `Texas sues OpenAI regarding claim${index} record${index} detail${index} issue${index} - Outlet${index}`);
    const posts = titles.map((title, index) => ({ ...news(title, index), body: title }));
    const fixture = workspaceSetup(posts, undefined, new TestPresentation(), 2, { verify });
    expect((await build(fixture)).kind).toBe("ready");
    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify.mock.calls[0]![0].evidence).toHaveLength(64);
    expect(verify.mock.calls[0]![0].candidates).toHaveLength(32);
  });

  it("aborts a stalled verifier at the independent deadline and keeps all stories", async () => {
    jest.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const fixture = setup(elvis, { verify: (input) => {
        signal = input.signal;
        return new Promise(() => {});
      } });
      const pending = build(fixture);
      await jest.advanceTimersByTimeAsync(90_000);
      const result = await pending;
      expect(signal?.aborted).toBe(true);
      expect(result.kind).toBe("ready");
      if (result.kind === "ready") expect(result.evidence.promotionV3?.news).toHaveLength(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it("never sends one publisher, social posts or ordinary RSS sites to the news verifier", async () => {
    const verify = jest.fn(async (_input: ReaderSummaryStoryRelationVerifierInput) => []);
    const posts = elvis.map((title, index) => ({ ...news(title, index),
      title: `${title.split(" - ")[0]} - One Publisher` }));
    const fixture = workspaceSetup([...posts,
      { ...news(elvis[0]!, 3), provider: "reddit",
        canonicalIdentity: "https://reddit.com/r/fixture/comments/4" },
      { ...news(elvis[1]!, 4), canonicalIdentity: "https://fixture.test/article" }],
    undefined, new TestPresentation(), 2, { verify });
    expect((await build(fixture)).kind).toBe("ready");
    expect(verify).not.toHaveBeenCalled();
  });
});
