import type { FetchedSourceItem } from "../../../ports";
import type { RedditPost } from "./reddit-client.port";

export const normalizePost = (
  post: RedditPost,
  minScore: number | undefined,
): readonly FetchedSourceItem[] => {
  if (post.over18 || post.removedByCategory !== undefined) {
    return [];
  }

  if (
    minScore !== undefined &&
    post.score !== undefined &&
    post.score < minScore
  ) {
    return [];
  }

  const title = post.title?.trim() ?? "";
  const body = post.selftext?.trim() ?? "";

  if (title.length + body.length === 0) {
    return [];
  }

  const publishedAt = publishedAtForPost(post);

  if (publishedAt === undefined) {
    return [];
  }

  return [
    {
      externalId: `reddit:${post.name ?? post.id}`,
      canonicalUrl: canonicalUrl(post),
      title,
      body,
      authorHandle: post.author,
      publishedAt,
      metadata: redditPostMetadata(post),
    },
  ];
};

export const redditWarnings = (
  posts: readonly RedditPost[],
  minScore: number | undefined,
): readonly string[] => [
  ...(posts.some((post) => post.over18 || post.removedByCategory !== undefined)
    ? ["Some Reddit posts were skipped because they were adult or removed."]
    : []),
  ...(posts.some((post) => isTimestampMissingCandidate(post, minScore))
    ? [
        "Some Reddit posts had no valid created_utc timestamp; they were skipped.",
      ]
    : []),
];

const isTimestampMissingCandidate = (
  post: RedditPost,
  minScore: number | undefined,
): boolean => {
  if (post.over18 || post.removedByCategory !== undefined) {
    return false;
  }

  if (
    minScore !== undefined &&
    post.score !== undefined &&
    post.score < minScore
  ) {
    return false;
  }

  const title = post.title?.trim() ?? "";
  const body = post.selftext?.trim() ?? "";

  return (
    title.length + body.length > 0 && publishedAtForPost(post) === undefined
  );
};

const publishedAtForPost = (post: RedditPost): Date | undefined => {
  if (
    post.createdUtc === undefined ||
    !Number.isFinite(post.createdUtc) ||
    post.createdUtc <= 0
  ) {
    return undefined;
  }

  const publishedAt = new Date(post.createdUtc * 1000);

  return Number.isNaN(publishedAt.getTime()) ? undefined : publishedAt;
};

const canonicalUrl = (post: RedditPost): string => {
  if (post.permalink !== undefined) {
    return new URL(post.permalink, "https://www.reddit.com").toString();
  }

  return post.url ?? `https://www.reddit.com/comments/${post.id}`;
};

const redditPostMetadata = (post: RedditPost) => ({
  kind: "reddit_post",
  ...(post.subreddit === undefined ? {} : { subreddit: post.subreddit }),
  ...(linkedUrl(post) === undefined ? {} : { linkedUrl: linkedUrl(post) }),
  ...(post.thumbnailUrl === undefined
    ? {}
    : { thumbnailUrl: post.thumbnailUrl }),
  ...(post.previewImageUrl === undefined
    ? {}
    : { previewImageUrl: post.previewImageUrl }),
  ...(post.postHint === undefined ? {} : { postHint: post.postHint }),
  ...(post.isVideo === undefined ? {} : { isVideo: post.isVideo }),
  ...(post.score === undefined ? {} : { score: post.score }),
  ...(post.numComments === undefined ? {} : { numComments: post.numComments }),
  ...(post.upvoteRatio === undefined ? {} : { upvoteRatio: post.upvoteRatio }),
});

const linkedUrl = (post: RedditPost): string | undefined => {
  if (post.url === undefined) {
    return undefined;
  }

  const discussionUrl = canonicalUrl(post);

  return post.url === discussionUrl ? undefined : post.url;
};
