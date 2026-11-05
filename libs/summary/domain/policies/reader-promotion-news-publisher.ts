import { publicCanonicalUrlIdentity } from "@social-monitor/shared-kernel";

const newsAggregatorHosts = new Set(["news.google.com"]);
const separator = " - ";
const maxPublisherLength = 120;

/**
 * Real publisher of a Google News item, read from the title suffix.
 *
 * Google News RSS titles look like "Chip export rules tighten - Reuters".
 * The aggregator itself is not the publisher, so without this rule one busy
 * outlet could fill the whole "News without rating" block through
 * news.google.com links. Returns a case-folded publisher key, or `null`
 * when the item is not from the aggregator or no publisher can be read; a
 * `null` publisher is never deduplicated.
 *
 * Examples:
 *   ("https://news.google.com/rss/articles/x", "Chips - Reuters") -> "reuters"
 *   ("https://news.google.com/rss/articles/x", "Chips")           -> null
 *   ("https://example.com/a", "Chips - Reuters")                  -> null
 */
export const readerPromotionNewsPublisher = (params: {
  readonly canonicalIdentity: string;
  readonly title: string;
}): string | null => newsAggregatorTitleParts(params)?.publisher ?? null;

/**
 * Splits a news.google.com title into the headline and its publisher key.
 * Story matching compares the headline only: the publisher suffix is the
 * source, not the story. `null` means the same as for
 * `readerPromotionNewsPublisher`.
 *
 * Example:
 *   ("https://news.google.com/rss/articles/x", "Chips tighten - Reuters")
 *     -> { headline: "Chips tighten", publisher: "reuters" }
 */
export const newsAggregatorTitleParts = (params: {
  readonly canonicalIdentity: string;
  readonly title: string;
}): { readonly headline: string; readonly publisher: string } | null => {
  if (!newsAggregatorHosts.has(hostOf(params.canonicalIdentity))) return null;
  const title = params.title.replace(/\s+/gu, " ").trim();
  const index = title.lastIndexOf(separator);
  if (index <= 0) return null;
  const publisher = title.slice(index + separator.length).trim();
  if (publisher.length === 0 || publisher.length > maxPublisherLength) return null;
  return { headline: title.slice(0, index).trim(),
    publisher: publisher.toLocaleLowerCase("en-US") };
};

/**
 * Reads the host from the public identity form so the frozen candidate and
 * its published attestation always agree on aggregator membership.
 */
const hostOf = (value: string): string => {
  const identity = publicCanonicalUrlIdentity(value).replace(/^url:/iu, "").trim();
  try {
    return new URL(identity.startsWith("//") ? `https:${identity}` : identity)
      .hostname.toLowerCase();
  } catch {
    return "";
  }
};
