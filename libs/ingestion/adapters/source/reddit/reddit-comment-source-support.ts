import type { FetchedConversationUnit } from '../../../ports';
import type {
  RedditComment,
  RedditPost,
} from './reddit-client.port';

export const normalizeComment = (
  comment: RedditComment,
  post: RedditPost,
  minScore: number | undefined,
): readonly FetchedConversationUnit[] => {
  if (comment.removedByCategory !== undefined) {
    return [];
  }

  if (
    minScore !== undefined &&
    comment.score !== undefined &&
    comment.score < minScore
  ) {
    return [];
  }

  const body = comment.body?.trim() ?? '';

  if (body.length === 0 || isRemovedCommentBody(body)) {
    return [];
  }

  const publishedAt = publishedAtForComment(comment);

  if (publishedAt === undefined) {
    return [];
  }

  const rootProviderItemId = post.name ?? post.id;
  const providerUnitId = comment.name ?? `t1_${comment.id}`;
  const parentProviderUnitId = readCommentParentUnitId(comment.parentId);
  const depth = readCommentDepth(comment);
  const role = depth > 0 || parentProviderUnitId !== undefined
    ? 'reply'
    : 'top_level_comment';

  return [
    {
      rootExternalId: `reddit:${rootProviderItemId}`,
      rootProviderItemId,
      providerUnitId,
      canonicalUrl: canonicalCommentUrl(comment, post),
      body,
      authorHandle: comment.author,
      publishedAt,
      threadExternalId: rootProviderItemId,
      parentProviderUnitId,
      depth,
      role,
      metadata: redditCommentMetadata(comment, post),
    },
  ];
};

const publishedAtForComment = (comment: RedditComment): Date | undefined => {
  if (
    comment.createdUtc === undefined ||
    !Number.isFinite(comment.createdUtc) ||
    comment.createdUtc <= 0
  ) {
    return undefined;
  }

  const publishedAt = new Date(comment.createdUtc * 1000);

  return Number.isNaN(publishedAt.getTime()) ? undefined : publishedAt;
};

const canonicalCommentUrl = (
  comment: RedditComment,
  post: RedditPost,
): string => {
  if (comment.permalink !== undefined) {
    return new URL(comment.permalink, 'https://www.reddit.com').toString();
  }

  const postUrl = canonicalPostUrl(post);

  return `${postUrl}${postUrl.includes('?') ? '&' : '?'}comment=${comment.id}`;
};

const canonicalPostUrl = (post: RedditPost): string => {
  if (post.permalink !== undefined) {
    return new URL(post.permalink, 'https://www.reddit.com').toString();
  }

  return post.url ?? `https://www.reddit.com/comments/${post.id}`;
};

const redditCommentMetadata = (comment: RedditComment, post: RedditPost) => {
  const subreddit = comment.subreddit ?? post.subreddit;
  const depth = readCommentDepth(comment);
  const role = depth > 0 || readCommentParentUnitId(comment.parentId) !== undefined
    ? 'reply'
    : 'top_level_comment';

  return {
    kind: 'reddit_comment',
    contentType: 'comment',
    parentPostId: post.name ?? post.id,
    rootProviderItemId: post.name ?? post.id,
    ...(post.title === undefined ? {} : { parentPostTitle: post.title }),
    ...(subreddit === undefined ? {} : { subreddit }),
    ...(comment.score === undefined ? {} : { score: comment.score }),
    ...(comment.score === undefined ? {} : { providerScore: comment.score }),
    replies: comment.replyCount ?? 0,
    replyCount: comment.replyCount ?? 0,
    depth,
    role,
    scoreConfidence: 'provider_reported',
    ...(comment.parentId === undefined ? {} : { parentId: comment.parentId }),
  };
};

const readCommentDepth = (comment: RedditComment): number =>
  comment.depth === undefined ||
  !Number.isInteger(comment.depth) ||
  comment.depth < 0
    ? 0
    : comment.depth;

const readCommentParentUnitId = (value: string | undefined): string | undefined =>
  value?.startsWith('t1_') === true ? value : undefined;

const isRemovedCommentBody = (body: string): boolean => {
  const normalized = body.trim().toLowerCase();

  return normalized === '[deleted]' || normalized === '[removed]';
};
