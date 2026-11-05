import { newsAggregatorTitleParts } from
  "../policies/reader-promotion-news-publisher";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";

/**
 * Hosts that carry many independent authors or publishers under one domain.
 *
 * On an ordinary site two different URLs are two different articles of the
 * same publisher, so story matching keeps them apart. Here they are posts of
 * different people (X, Reddit) or articles of different publishers relayed
 * by Google News, and they may well tell the same story. Example: on
 * 2026-10-22 six news.google.com links about the OpenAI $1.25T valuation
 * (Bloomberg, TechCrunch, CNBC...) never merged and filled the whole top of
 * "News without rating".
 */
const multiSourceStoryHosts = new Set(["news.google.com", "x.com", "reddit.com"]);

/** Host part of a `url:` story key, e.g. "url:x.com/a/status/1" -> "x.com". */
export const storyKeyHost = (key: string): string | undefined =>
  key.startsWith("url:") ? key.slice(4).split("/").at(0) : undefined;

export const isMultiSourceStoryHost = (host: string | undefined): boolean =>
  host !== undefined && multiSourceStoryHosts.has(host);

/**
 * Title as story text: without the "X post by @a:" and "Show HN:" envelopes
 * and without the Google News " - Publisher" suffix. "Walmart launches AI
 * shopping agents - Reuters" and "... - Miami Herald" become one headline.
 */
export const storySourceTitle = (
  item: Pick<SummaryEvidenceItem, "title" | "canonicalUrl">,
): string =>
  (newsAggregatorTitleParts({ canonicalIdentity: item.canonicalUrl, title: item.title })
    ?.headline ?? item.title)
    .replace(/^x\s+post\s+by\s+@[^:]+:\s*/iu, "")
    .replace(/^(?:ask|show)\s+hn:\s*/iu, "");

/**
 * How two posts of story text may be matched by the deterministic rules.
 * `undefined`: never (one source, or an ordinary site).
 *
 * - `provider`: different providers; every deterministic rule applies.
 * - `publisher`: two Google News articles of different publishers; an exact
 *   or semantically matching headline. One publisher never confirms itself.
 * - `platform_copy`: two posts on X or Reddit, by different authors or by the
 *   same author (a crosspost); only a copy counts, see
 *   `isPlatformStoryCopy`.
 *
 * Why `platform_copy` is so narrow: on 2026-10-21..23 the token-similarity
 * rules merged unrelated X posts that shared only generic topic aliases (mcp,
 * ai-agent, release-event), e.g. an MLX-LM-LoRA release with Walmart's Agent
 * Gateway, while every Google News headline match was the same story.
 */
export type StorySourceIndependence = "provider" | "publisher" | "platform_copy";

export const storySourceIndependence = (
  left: SummaryEvidenceItem,
  leftKey: string,
  right: SummaryEvidenceItem,
  rightKey: string,
): StorySourceIndependence | undefined => {
  if (left.providerKey !== right.providerKey) return "provider";
  const host = storyKeyHost(leftKey);
  if (host !== storyKeyHost(rightKey) || !isMultiSourceStoryHost(host)) return undefined;
  if (host !== "news.google.com") return "platform_copy";
  const leftPublisher = publisherOf(left);
  const rightPublisher = publisherOf(right);
  return leftPublisher !== undefined && rightPublisher !== undefined &&
    leftPublisher !== rightPublisher ? "publisher" : undefined;
};

/**
 * A copy of one story on X or Reddit: the exact headline (checked by the
 * caller) plus the same body text (links removed, at least five words) or the
 * same external links (`sourceOriginUrl` and links in the body, without
 * platform and short-link hosts), and a headline that is not a recurring
 * slot. Reddit `linkedUrl` is not carried into story evidence, so link-only
 * crossposts with empty bodies stay separate. "Daily Discussion Thread" or "Good morning
 * everyone" repeat every day with different content and never merge; two
 * reposts of "The internet is going into a LOCKDOWN..." with the same text
 * do, and so does one author's crosspost with the same title and body.
 */
export const isPlatformStoryCopy = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): boolean => {
  const headline = storySourceTitle(left).replace(/^[^\p{Letter}\p{Number}]+/u, "");
  if (recurringSlotHeadline.test(headline)) return false;
  const leftLinks = externalLinks(left);
  if (leftLinks.length > 0 &&
      leftLinks.join("\n") === externalLinks(right).join("\n")) return true;
  const leftBody = copyText(left);
  return leftBody.split(" ").length >= minimumCopyTokens && leftBody === copyText(right);
};

/** Recurring headlines that name a slot or a greeting, not a story. */
const recurringSlotHeadline = new RegExp([
  String.raw`^(?:daily|weekly|monthly|weekend|today'?s)\b.*\b(?:thread|discussion|megathread|roundup|digest)\b`,
  String.raw`\bmegathread\b`,
  String.raw`^(?:general|open|discussion|help|questions?|self[\s-]?promotion)\s+thread\b`,
  String.raw`^(?:gm|gn|good\s+(?:morning|afternoon|evening|night))\b`,
  String.raw`^what\s+are\s+you\s+(?:working\s+on|building|reading)\b`,
].join("|"), "iu");

const minimumCopyTokens = 5;
const platformLinkHosts = new Set(["t.co", "x.com", "twitter.com", "reddit.com",
  "redd.it", "i.redd.it", "v.redd.it", "preview.redd.it", "news.google.com"]);

/** Sorted external links a post points to; platform and short links say nothing. */
const externalLinks = (item: SummaryEvidenceItem): readonly string[] => {
  const text = `${item.sourceOriginUrl ?? ""} ${item.sourceText ?? item.bodyPreview ?? ""}`;
  const links = new Set<string>();
  for (const [raw] of text.matchAll(/https?:\/\/[^\s)\]>"']+/giu)) {
    try {
      const url = new URL(raw.replace(/[.,;:!?]+$/u, ""));
      const host = url.hostname.toLocaleLowerCase("en-US").replace(/^(?:www|old|m)\./u, "");
      if (platformLinkHosts.has(host)) continue;
      url.hash = "";
      links.add(`${host}${url.pathname.replace(/\/+$/u, "")}${url.search}`);
    } catch {
      continue;
    }
  }
  return [...links].sort();
};

/**
 * Body without links and @mentions (reposts carry their own t.co links and a
 * "follow @me" line), case and punctuation.
 */
const copyText = (item: SummaryEvidenceItem): string =>
  (item.sourceText ?? item.bodyPreview ?? "")
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/@[\p{Letter}\p{Number}_]+/gu, " ")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();

const publisherOf = (item: SummaryEvidenceItem): string | undefined =>
  newsAggregatorTitleParts({ canonicalIdentity: item.canonicalUrl, title: item.title })
    ?.publisher;

/** Same RSS transport, independently named publishers, never platform posts. */
export const hasIndependentNewsPublishers = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): boolean => {
  if (left.providerKey !== "rss" || right.providerKey !== "rss") return false;
  const a = publisherOf(left);
  const b = publisherOf(right);
  return a !== undefined && b !== undefined && a !== b;
};
