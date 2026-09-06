import { err, ok } from "@social-monitor/shared-kernel";
import type { RetainedMetricFetchCapability, RetainedMetricTarget, MetricFetchObservation } from "../../features/refresh-retained-metrics/refresh-retained-metrics.contracts";
import { normalizedRefreshId } from "../../features/refresh-retained-metrics/metric-refresh-admission";
import type { HackerNewsClientPort } from "./hacker-news/hacker-news-client.port";
import type { RedditPostsByIdsClient } from "./reddit/reddit-client.port";
import type { RedditTokenProviderPort } from "./reddit/reddit-token-provider.port";

export class RetainedMetricFetchAdapter implements RetainedMetricFetchCapability {
  constructor(private readonly hn: Pick<HackerNewsClientPort, "getStory">,
    private readonly reddit: RedditPostsByIdsClient, private readonly token: RedditTokenProviderPort,
    private readonly userAgent: string) {}

  async fetch(targets: readonly RetainedMetricTarget[]) {
    const first = targets[0];
    if (!first || targets.some((target) => target.providerKey !== first.providerKey || target.sourceBindingId !== first.sourceBindingId)) return err("invalid_batch");
    const ids = targets.map((target) => normalizedRefreshId(target.providerKey, target.externalId));
    if (ids.some((id) => id === null) || new Set(ids).size !== ids.length) return err("invalid_ids");
    try {
      if (first.providerKey === "hacker-news") {
        if (targets.length !== 1) return err("hn_batch_limit");
        const story = await this.hn.getStory(Number(ids[0]));
        if (story === null) return ok([unavailable(first, "null_dead_deleted", false)]);
        if (story.id !== Number(ids[0])) return err("provider_identity_mismatch");
        if (story.dead || story.deleted) return ok([unavailable(first, "null_dead_deleted")]);
        if (story.kind !== "story" || story.time !== Date.parse(first.publishedAt) / 1000) return err("provider_identity_mismatch");
        if (!Number.isSafeInteger(story.score) || !Number.isSafeInteger(story.comments)) return err("invalid_metrics");
        return ok([{ externalId: first.externalId, returned: true, reason: null, metadata: {
          kind: "hacker_news_story", points: story.score!, comments: story.comments!,
        } }]);
      }
      if (targets.length > 100) return err("reddit_batch_limit");
      const response = await this.reddit.getPostsByIds({ accessToken: await this.token.getAccessToken(), userAgent: this.userAgent, ids: ids as string[] });
      const seen = new Set<string>();
      const observations: MetricFetchObservation[] = [];
      for (const post of response.posts) {
        const id = `t3_${post.id}`;
        const target = targets.find((candidate) => normalizedRefreshId(candidate.providerKey, candidate.externalId) === id);
        if (!target || post.name !== id || seen.has(id)) return err("provider_identity_mismatch");
        seen.add(id);
        if (post.removedByCategory || post.selftext === "[removed]" || post.selftext === "[deleted]" || post.author === "[deleted]" || post.over18) {
          observations.push(unavailable(target, "removed_deleted_or_hidden")); continue;
        }
        if (post.createdUtc !== Date.parse(target.publishedAt) / 1000 ||
            redditPermalinkId(post.permalink, "https://www.reddit.com") !== id ||
            redditPermalinkId(target.canonicalUrl) !== id) return err("provider_identity_mismatch");
        if (!Number.isSafeInteger(post.score) || !Number.isSafeInteger(post.numComments)) return err("invalid_metrics");
        observations.push({ externalId: target.externalId, returned: true, reason: null, metadata: {
          kind: "reddit_post", score: post.score!, numComments: post.numComments!,
          ...(post.upvoteRatio === undefined ? {} : { upvoteRatio: post.upvoteRatio }),
        } });
      }
      const omitted = ids.filter((id) => !seen.has(id!));
      if (new Set(response.omittedIds).size !== response.omittedIds.length || [...response.omittedIds].sort().join() !== omitted.sort().join()) return err("omitted_identity_mismatch");
      return ok(observations);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      return err(/\b429\b/u.test(message) ? "provider_429_no_retry" : "provider_fetch_failed_no_retry");
    }
  }
}
function redditPermalinkId(value: string | undefined, base?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash ||
        !["www.reddit.com", "reddit.com", "old.reddit.com"].includes(url.hostname)) return null;
    // Short canonical URLs and subreddit/slug variants name the same post.
    const match = /^\/(?:r\/[^/]+\/)?comments\/([a-z0-9]+)(?:\/|$)/u.exec(url.pathname);
    return match ? `t3_${match[1]}` : null;
  } catch { return null; }
}
function unavailable(target: RetainedMetricTarget, reason: string, returned = true): MetricFetchObservation {
  return { externalId: target.externalId, returned, metadata: null, reason };
}
