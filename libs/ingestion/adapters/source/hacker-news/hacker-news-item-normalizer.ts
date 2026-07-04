import type { HackerNewsStory } from "./hacker-news-client.port";

/// Normalizes Hacker News wire items into fetched source items plus the
/// human-readable scan warnings that describe skipped entries.
export const normalizeHackerNewsStory = (
  story: HackerNewsStory,
  sourceKey: string,
  searchQuery: string | undefined,
) => {
  if (story.kind === "comment") {
    return normalizeHackerNewsComment(story, sourceKey, searchQuery);
  }

  if (story.deleted || story.dead || story.title === undefined) {
    return [];
  }

  const publishedAt = publishedAtForStory(story);

  if (publishedAt === undefined) {
    return [];
  }

  const discussionUrl = `https://news.ycombinator.com/item?id=${story.id}`;

  return [
    {
      externalId: `hn:${story.id}`,
      canonicalUrl: discussionUrl,
      title: story.title,
      body: story.text ?? "",
      authorHandle: story.by,
      publishedAt,
      metadata: hackerNewsStoryMetadata(story, sourceKey, searchQuery),
    },
  ];
};

const normalizeHackerNewsComment = (
  story: HackerNewsStory,
  sourceKey: string,
  searchQuery: string | undefined,
) => {
  if (story.deleted || story.dead || story.text === undefined) {
    return [];
  }

  const publishedAt = publishedAtForStory(story);

  if (publishedAt === undefined) {
    return [];
  }

  return [
    {
      externalId: `hn:${story.id}`,
      canonicalUrl: `https://news.ycombinator.com/item?id=${story.id}`,
      title: story.storyTitle ?? "Hacker News comment",
      body: story.text,
      authorHandle: story.by,
      publishedAt,
      metadata: hackerNewsCommentMetadata(story, sourceKey, searchQuery),
    },
  ];
};

export const hackerNewsWarnings = (
  stories: readonly HackerNewsStory[],
): readonly string[] => [
  ...(stories.some((story) => story.deleted || story.dead)
    ? ["Some Hacker News items were deleted/dead and skipped."]
    : []),
  ...(stories.some(isTimestampMissingCandidate)
    ? ["Some Hacker News items had no valid time timestamp; they were skipped."]
    : []),
];

export const hackerNewsRecencyWarnings = (
  items: readonly { readonly publishedAt: Date }[],
  filteredItems: readonly { readonly publishedAt: Date }[],
  maxItemAgeHours: number | undefined,
): readonly string[] =>
  maxItemAgeHours !== undefined && filteredItems.length < items.length
    ? [
        `Some Hacker News items were older than maxItemAgeHours=${maxItemAgeHours}; they were skipped.`,
      ]
    : [];

const isTimestampMissingCandidate = (story: HackerNewsStory): boolean =>
  !story.deleted &&
  !story.dead &&
  (story.kind === "comment"
    ? story.text !== undefined
    : story.title !== undefined) &&
  publishedAtForStory(story) === undefined;

const publishedAtForStory = (story: HackerNewsStory): Date | undefined => {
  if (
    story.time === undefined ||
    !Number.isFinite(story.time) ||
    story.time <= 0
  ) {
    return undefined;
  }

  const publishedAt = new Date(story.time * 1000);

  return Number.isNaN(publishedAt.getTime()) ? undefined : publishedAt;
};

const hackerNewsStoryMetadata = (
  story: HackerNewsStory,
  sourceKey: string,
  searchQuery: string | undefined,
) => ({
  kind: "hacker_news_story",
  source: sourceKey,
  ...(searchQuery === undefined ? {} : { searchQuery }),
  ...(story.url === undefined ? {} : { externalUrl: story.url }),
  ...(story.score === undefined ? {} : { points: story.score }),
  ...(story.comments === undefined ? {} : { comments: story.comments }),
});

const hackerNewsCommentMetadata = (
  story: HackerNewsStory,
  sourceKey: string,
  searchQuery: string | undefined,
) => ({
  kind: "hacker_news_comment",
  source: sourceKey,
  ...(searchQuery === undefined ? {} : { searchQuery }),
  ...(story.storyId === undefined ? {} : { storyId: story.storyId }),
  ...(story.parentId === undefined ? {} : { parentId: story.parentId }),
  ...(story.storyTitle === undefined ? {} : { storyTitle: story.storyTitle }),
});
