import type { FetchedConversationUnit, FetchedSourceItem } from "../../../ports";
import type { HackerNewsStory } from "./hacker-news-client.port";

/// Normalizes Hacker News wire items into fetched source items plus the
/// human-readable scan warnings that describe skipped entries.
export const normalizeHackerNewsStory = (
  story: HackerNewsStory,
  sourceKey: string,
  searchQuery: string | undefined,
): readonly FetchedSourceItem[] => {
  if (story.kind === "comment") {
    return [];
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

export const normalizeHackerNewsCommentConversationUnit = (
  comment: HackerNewsStory,
  rootStory: HackerNewsStory,
  sourceKey: string,
  searchQuery: string | undefined,
): readonly FetchedConversationUnit[] => {
  if (
    comment.kind !== "comment" ||
    comment.deleted ||
    comment.dead ||
    comment.text === undefined
  ) {
    return [];
  }

  const rootStoryId = comment.storyId ?? rootStory.id;

  if (rootStoryId !== rootStory.id) {
    return [];
  }

  const publishedAt = publishedAtForStory(comment);

  if (publishedAt === undefined) {
    return [];
  }

  const rootExternalId = `hn:${rootStory.id}`;
  const parentProviderUnitId =
    comment.parentId === undefined || comment.parentId === rootStory.id
      ? undefined
      : `hn:${comment.parentId}`;
  const depth = readCommentDepth(comment, parentProviderUnitId);
  const role = depth === 0 ? "top_level_comment" : "reply";

  return [
    {
      rootExternalId,
      rootProviderItemId: String(rootStory.id),
      providerUnitId: `hn:${comment.id}`,
      canonicalUrl: `https://news.ycombinator.com/item?id=${comment.id}`,
      body: comment.text,
      authorHandle: comment.by,
      publishedAt,
      threadExternalId: rootExternalId,
      parentProviderUnitId,
      depth,
      role,
      metadata: hackerNewsCommentMetadata(
        comment,
        rootStory,
        sourceKey,
        searchQuery,
        depth,
        role,
      ),
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
  comment: HackerNewsStory,
  rootStory: HackerNewsStory,
  sourceKey: string,
  searchQuery: string | undefined,
  depth: number,
  role: "top_level_comment" | "reply",
) => ({
  kind: "hacker_news_comment",
  contentType: "comment",
  source: sourceKey,
  ...(searchQuery === undefined ? {} : { searchQuery }),
  rootProviderItemId: String(rootStory.id),
  storyId: rootStory.id,
  ...(comment.parentId === undefined ? {} : { parentId: comment.parentId }),
  ...(comment.storyTitle === undefined
    ? rootStory.title === undefined
      ? {}
      : { storyTitle: rootStory.title }
    : { storyTitle: comment.storyTitle }),
  ...(comment.score === undefined
    ? {}
    : { score: comment.score, providerScore: comment.score }),
  ...(comment.rank === undefined ? {} : { rank: comment.rank }),
  replies: comment.kids?.length ?? 0,
  replyCount: comment.kids?.length ?? 0,
  depth,
  role,
  signalQuality: hackerNewsCommentSignalQuality(comment.text ?? ""),
  scoreConfidence:
    comment.score === undefined ? "not_available" : "provider_reported",
  ...(comment.rank === undefined ? {} : { rankConfidence: "hn_display_order" }),
});

const readCommentDepth = (
  comment: HackerNewsStory,
  parentProviderUnitId: string | undefined,
): number => {
  if (
    comment.depth !== undefined &&
    Number.isInteger(comment.depth) &&
    comment.depth >= 0
  ) {
    return comment.depth;
  }

  return parentProviderUnitId === undefined ? 0 : 1;
};

const hackerNewsCommentSignalQuality = (
  text: string,
): "normal" | "low" => (isLowSignalCommentText(text) ? "low" : "normal");

const lowSignalCommentTexts = new Set([
  "+1",
  "agreed",
  "citation needed",
  "cool",
  "exactly",
  "haha",
  "interesting",
  "lmao",
  "lol",
  "nice",
  "no",
  "ok",
  "okay",
  "same",
  "source?",
  "thanks",
  "thank you",
  "this",
  "ty",
  "wow",
  "yes",
  "yikes",
]);

const isLowSignalCommentText = (text: string): boolean => {
  const normalized = text.replace(/\s+/g, " ").trim().toLocaleLowerCase("en-US");
  const withoutUrls = normalized
    .replace(/https?:\/\/\S+/giu, "")
    .replace(/[.!]+$/u, "")
    .trim();

  if (withoutUrls.length === 0 || lowSignalCommentTexts.has(withoutUrls)) {
    return true;
  }

  if (/^\+?1+$/u.test(withoutUrls)) {
    return true;
  }

  const words = withoutUrls.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];

  return withoutUrls.length < 12 && words.length <= 2;
};
