import type { SummaryEvidenceItem, SummaryEvidenceSelection } from "../index";
import { buildGuardedRecallCandidates } from "./story-relation-guarded-recall";
import { storyRelationHardNegative } from "./story-relation-hard-negative";
import { storyEventSignature } from "./story-event-signature";
import { STORY_RANKING_POLICY_V1 } from "../policies/story-ranking-policy";

describe("guarded primary story recall", () => {
  it.each([
    ["Acme announces confirmed Beta acquisition",
      "Acme acquired Beta in confirmed deal"],
  ])("shortlists %s ↔ %s", (leftTitle, rightTitle) => {
    expect(generation(item("left", "x-twitter", leftTitle),
      item("right", "hacker-news", rightTitle)).candidates).toHaveLength(1);
  });

  it("shortlists the production Cursor and SpaceX wording", () => {
    const left = { ...item("left", "hacker-news", "Cursor deployed at SpaceX latest"),
      bodyPreview: "An official note contains no copied announcement prose." };
    const right = { ...item("right", "x-twitter", "SpaceX deploying Cursor for engineers"),
      bodyPreview: "SpaceX confirms the deployment in separate wrapper metadata." };
    expect(storyRelationHardNegative({ left, right,
      policy: STORY_RANKING_POLICY_V1 })).toBeUndefined();
    expect(generation(left, right).candidates).toHaveLength(1);
  });

  it("does not treat event-lemma non-overlap alone as a universal negative", () => {
    const left = item("left", "x-twitter",
      "Acme announces Platform release");
    const right = item("right", "hacker-news",
      "Acme ships Platform update");
    expect(storyRelationHardNegative({ left, right,
      policy: STORY_RANKING_POLICY_V1 })).toBeUndefined();
  });

  it.each([
    ["opposite active claim", "SpaceX acquired Cursor assets in deal"],
    ["opposite passive claim", "Cursor assets were acquired by SpaceX in deal"],
    ["opposite nominalized claim", "SpaceX acquisition of Cursor operations"],
  ])("vetoes an exact directional acquisition conflict: %s",
    (_name, oppositeTitle) => {
      const left = item("left", "x-twitter",
        "Cursor acquired SpaceX assets in deal");
      const right = item("right", "hacker-news", oppositeTitle);
      expect(storyRelationHardNegative({ left, right,
        policy: STORY_RANKING_POLICY_V1 })).toBe("directional_role_conflict");
      expect(generation(left, right).candidates).toHaveLength(0);
    });

  it.each([
    ["control", "Cursor controlled SpaceX operations",
      "SpaceX control of Cursor operations"],
    ["investment", "Cursor invested in SpaceX operations",
      "SpaceX investment in Cursor operations"],
    ["merger", "Cursor merged SpaceX operations",
      "SpaceX merger of Cursor operations"],
    ["partnership", "Cursor partnered SpaceX operations",
      "SpaceX partnership of Cursor operations"],
  ])("vetoes opposite %s roles", (_event, leftTitle, rightTitle) => {
    expect(storyRelationHardNegative({
      left: item("left", "x-twitter", leftTitle),
      right: item("right", "hacker-news", rightTitle),
      policy: STORY_RANKING_POLICY_V1,
    })).toBe("directional_role_conflict");
  });

  it.each([
    ["merger", "Cursor merged with SpaceX",
      "SpaceX merger with Cursor"],
    ["partnership", "Cursor partnered with SpaceX",
      "SpaceX partnership with Cursor"],
  ])("keeps symmetric %s roles", (_event, leftTitle, rightTitle) => {
    expect(storyRelationHardNegative({
      left: item("left", "x-twitter", leftTitle),
      right: item("right", "hacker-news", rightTitle),
      policy: STORY_RANKING_POLICY_V1,
    })).toBeUndefined();
  });

  it.each([
    "SpaceX assets were acquired by Cursor in deal",
    "Cursor acquisition of SpaceX operations",
  ])("keeps same-direction active/passive/nominalized acquisition wording: %s",
    (sameDirectionTitle) => {
      const left = item("left", "x-twitter",
        "Cursor acquired SpaceX assets in deal");
      const right = item("right", "hacker-news", sameDirectionTitle);
      expect(storyRelationHardNegative({ left, right,
        policy: STORY_RANKING_POLICY_V1 })).toBeUndefined();
    });

  it.each([
    "Cursor acquired SpaceX",
    "SpaceX got acquired by Cursor",
    "SpaceX gets acquired by Cursor",
    "SpaceX has gotten acquired by Cursor",
    "SpaceX may get acquired by Cursor",
    "Investment of $10m by Cursor in SpaceX",
    "Cursor acquisition of SpaceX approved by Microsoft",
    "Cursor is acquiring SpaceX by Microsoft-backed tender",
  ])("parses the directed Cursor to SpaceX role safely: %s", (title) => {
    expect(storyEventSignature(title)?.eventRoles).toContainEqual({
      event: title.startsWith("Investment") ? "investment" : "acquisition",
      actorAnchor: "cursor",
      objectAnchor: "spacex",
      direction: "directed",
    });
  });

  it("keeps the opposite get-passive direction distinct", () => {
    expect(storyEventSignature("Cursor got acquired by SpaceX")?.eventRoles)
      .toContainEqual({
        event: "acquisition",
        actorAnchor: "spacex",
        objectAnchor: "cursor",
        direction: "directed",
      });
  });

  it("does not use an unrelated by-phrase as a progressive passive agent", () => {
    expect(storyEventSignature(
      "Cursor is acquiring SpaceX by Microsoft-backed tender",
    )?.eventRoles).not.toContainEqual(expect.objectContaining({
      actorAnchor: "microsoft",
    }));
  });

  it.each([
    ["acquisition", "Cursor acquired SpaceX operations",
      "SpaceX operations were acquired by Cursor",
      "Acquisition of SpaceX operations by Cursor"],
    ["control", "Cursor controlled SpaceX operations",
      "SpaceX operations were controlled by Cursor",
      "Control of SpaceX operations by Cursor"],
    ["investment", "Cursor invested in SpaceX operations",
      "SpaceX operations were invested in by Cursor",
      "Investment by Cursor in SpaceX operations"],
    ["merger", "Cursor merged SpaceX operations",
      "SpaceX operations were merged by Cursor",
      "Merger of SpaceX operations by Cursor"],
    ["partnership", "Cursor partnered SpaceX operations",
      "SpaceX operations were partnered by Cursor",
      "Partnership of SpaceX operations by Cursor"],
  ])("merges equivalent active/passive/nominalized %s roles",
    (_event, active, passive, nominal) => {
      for (const equivalent of [passive, nominal]) {
        const left = item("left", "x-twitter", active);
        const right = item("right", "hacker-news", equivalent);
        expect(storyEventSignature(equivalent)?.eventRoles)
          .toEqual(storyEventSignature(active)?.eventRoles);
        expect(storyRelationHardNegative({ left, right,
          policy: STORY_RANKING_POLICY_V1 })).toBeUndefined();
        expect(generation(left, right).aggregates).toContainEqual({
          reasonCode: "excluded_existing_deterministic",
          candidatePolicyVersion:
            "reader_summary.story_relation.guarded_recall.v1",
          count: 1,
        });
      }
    });

  it.each([
    ["acquisition", "Cursor acquired SpaceX operations",
      "Cursor operations were acquired by SpaceX"],
    ["control", "Cursor controlled SpaceX operations",
      "Cursor operations were controlled by SpaceX"],
    ["investment", "Cursor invested in SpaceX operations",
      "Cursor operations were invested in by SpaceX"],
    ["merger", "Cursor merged SpaceX operations",
      "Cursor operations were merged by SpaceX"],
    ["partnership", "Cursor partnered SpaceX operations",
      "Cursor operations were partnered by SpaceX"],
  ])("vetoes opposite passive %s roles before verification",
    (_event, active, opposite) => {
      const left = item("left", "x-twitter", active);
      const right = item("right", "hacker-news", opposite);
      expect(storyRelationHardNegative({ left, right,
        policy: STORY_RANKING_POLICY_V1 })).toBe("directional_role_conflict");
      expect(generation(left, right).candidates).toHaveLength(0);
    });

  it.each([
    ["Could Claude watermark Code output happen?",
      "Claude Code output watermarked in release"],
    ["Acme announces Alpha acquisition", "Acme announces Beta acquisition"],
    ["Acme acquired Beta from Alpha", "Acme acquired Beta from Gamma"],
    ["Acme release Platform update", "Acme release Platform update"],
    ["Acme did not release Platform 2.0", "Acme released Platform 2.0"],
    ["Acme released Platform 2.0", "Acme released Platform 3.0"],
  ])("rejects a deterministic hard negative", (leftTitle, rightTitle) => {
    expect(generation(item("left", "x-twitter", leftTitle),
      item("right", "hacker-news", rightTitle)).candidates).toHaveLength(0);
  });

  it("accepts a missing body when complete declarative titles carry the event", () => {
    expect(generation(
      item("left", "x-twitter",
        "Cursor deployed at SpaceX production engineering migration schedule"),
      item("right", "hacker-news",
        "SpaceX deploying Cursor staff coding fleet rollout"),
    ).candidates).toHaveLength(1);
  });

  it("treats 30 hours as inclusive and 30 hours plus one millisecond as closed", () => {
    const left = item("left", "x-twitter",
      "Cursor deployed at SpaceX production engineering migration schedule");
    const boundary = item("right", "hacker-news",
      "SpaceX deploying Cursor staff coding fleet rollout",
      30 * 60 * 60 * 1_000);
    expect(generation(left, boundary).candidates).toHaveLength(1);
    expect(generation(left, { ...boundary,
      publishedAt: new Date(boundary.publishedAt.getTime() + 1) }).candidates)
      .toHaveLength(0);
  });

  it("fails closed for a missing title, invalid timestamp, same provider alias and URL conflict", () => {
    const left = item("left", "x-twitter", "SpaceX deployed Cursor production");
    const right = item("right", "twitter", "Cursor deploying at SpaceX production");
    expect(generation(left, right).candidates).toHaveLength(0);
    expect(generation(left, { ...right, providerKey: "hacker-news", title: "" })
      .candidates).toHaveLength(0);
    expect(generation(left, { ...right, providerKey: "hacker-news",
      publishedAt: new Date(Number.NaN) }).candidates).toHaveLength(0);
    expect(generation(
      { ...left, canonicalUrl: "https://example.test/one" },
      { ...right, providerKey: "hacker-news",
        canonicalUrl: "https://example.test/two" },
    ).candidates).toHaveLength(0);
  });

  it("uses canonical provider families, including RSS origin aliases", () => {
    const rssHackerNews = {
      ...item("left", "rss", "Cursor deployed at SpaceX latest"),
      canonicalUrl: "https://news.ycombinator.com/item?id=42",
    };
    expect(generation(rssHackerNews,
      item("right", "hacker-news", "SpaceX deploying Cursor for engineers"))
      .candidates).toHaveLength(0);
    expect(generation({ ...rssHackerNews,
      canonicalUrl: "https://acme.example.test/releases/platform" },
    item("right", "x-twitter", "SpaceX deploying Cursor for engineers"))
      .candidates).toHaveLength(1);
  });

  it("rejects conflicting canonical repositories", () => {
    const left = { ...item("left", "reddit", "Acme released Platform today"),
      canonicalUrl: "https://github.com/acme/alpha" };
    const right = { ...item("right", "x-twitter",
      "Platform released by Acme today"),
    canonicalUrl: "https://github.com/acme/beta" };
    expect(storyRelationHardNegative({ left, right,
      policy: STORY_RANKING_POLICY_V1 })).toBe("canonical_identity_conflict");
  });

  it.each([
    ["Acme released Platform in US", "Platform released by Acme in EU"],
    ["Acme released Platform confirmed", "Platform release by Acme failed"],
  ])("rejects location and outcome contradictions", (leftTitle, rightTitle) => {
    expect(storyRelationHardNegative({
      left: item("left", "reddit", leftTitle),
      right: item("right", "x-twitter", rightTitle),
      policy: STORY_RANKING_POLICY_V1,
    })).toBe("contradictory_detail");
  });

  it("rejects rumor, broad-topic, same-author, quote-origin, facet and date conflicts", () => {
    const candidate = (left: SummaryEvidenceItem, right: SummaryEvidenceItem) =>
      generation(left, right).candidates;
    expect(candidate(
      item("left", "x-twitter", "OpenAI AI company technology news update"),
      item("right", "reddit", "OpenAI AI company technology news update"),
    )).toHaveLength(0);
    expect(candidate(
      item("left", "x-twitter", "Acme rumor Beta acquisition"),
      item("right", "reddit", "Acme acquired Beta confirmed"),
    )).toHaveLength(0);
    expect(candidate(
      { ...item("left", "x-twitter", "Acme acquired Beta confirmed"),
        authorHandle: "same-author" },
      { ...item("right", "reddit", "Beta acquisition by Acme confirmed"),
        authorHandle: "same-author" },
    )).toHaveLength(0);
    expect(candidate(
      { ...item("left", "x-twitter", "Acme acquired Beta confirmed"),
        promotionFacts: { contentKind: "quote", canonicalIdentity: "left",
          safetyValid: true, freshnessValid: true } },
      item("right", "reddit", "Beta acquisition by Acme confirmed"),
    )).toHaveLength(0);
    expect(candidate(
      item("left", "x-twitter", "Acme released Platform review"),
      item("right", "reddit", "Platform released by Acme tutorial"),
    )).toHaveLength(0);
    expect(candidate(
      item("left", "x-twitter", "Acme released Platform in 2025"),
      item("right", "reddit", "Platform released by Acme in 2026"),
    )).toHaveLength(0);
  });

  it("clears a question only with a matching independent declarative body sentence", () => {
    const question = {
      ...item("left", "reddit", "Could Claude Code watermark output happen?"),
      bodyPreview: "Claude Code watermark output confirmed.",
    };
    const announcement = item("right", "x-twitter",
      "Claude Code output watermarked today");
    expect(storyRelationHardNegative({ left: question, right: announcement,
      policy: STORY_RANKING_POLICY_V1 })).toBeUndefined();
    expect(storyRelationHardNegative({ left: { ...question,
      bodyPreview: "People discussed similar output." }, right: announcement,
      policy: STORY_RANKING_POLICY_V1 })).toBe("speculative_modality");
  });
});

const generation = (left: SummaryEvidenceItem, right: SummaryEvidenceItem) =>
  buildGuardedRecallCandidates({
    selection: selection(left, right),
    evidence: [left, right],
    primaryCandidates: [],
  });

const selection = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): SummaryEvidenceSelection => ({
  rankingPolicyVersion: "story-ranking-v1",
  sourceWindow: {
    windowId: "window", startedAt: left.publishedAt, endedAt: new Date(
      Math.max(left.publishedAt.getTime(), right.publishedAt.getTime()) + 1),
    selectedFeedItemIds: [left.feedItemId, right.feedItemId],
    storyClusterIds: ["cluster:left", "cluster:right"],
  },
  clusters: [left, right].map((value) => ({
    id: `cluster:${value.feedItemId}`,
    storyKey: `story:${value.feedItemId}`,
    representativeFeedItemId: value.feedItemId,
    duplicateFeedItemIds: [], interestIds: [value.interestId],
    providerKeys: [value.providerKey], score: value.score,
    observedAtRange: { startedAt: value.observedAt,
      endedAt: new Date(value.observedAt.getTime() + 1) },
    whyImportant: [],
  })),
  selectedEvidence: [left, right],
});

const item = (
  feedItemId: string,
  providerKey: string,
  title: string,
  offsetMs = 0,
): SummaryEvidenceItem => ({
  feedItemId, providerKey, title,
  sourceItemId: `source:${feedItemId}`,
  sourceBindingId: `binding:${feedItemId}`,
  interestId: "interest",
  canonicalUrl: `https://${providerKey}.example.test/${feedItemId}`,
  publishedAt: new Date(Date.UTC(2026, 7, 20) + offsetMs),
  observedAt: new Date(Date.UTC(2026, 7, 20) + offsetMs),
  score: 1,
  whyImportant: [],
});
