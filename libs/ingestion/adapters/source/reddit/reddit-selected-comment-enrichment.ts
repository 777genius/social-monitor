import { redactSensitiveText } from "@social-monitor/shared-kernel";

import type { FetchedConversationUnit, FetchedSourceItem } from "../../../ports";
import type {
  RedditClientPort,
  RedditCommentPage,
  RedditPost,
} from "./reddit-client.port";
import { normalizeComment } from "./reddit-comment-source-support";
import { normalizePost, type RedditScanPass } from "./reddit-source-support";

export type RedditSelectedPostCommentExpansion = {
  readonly minScore: number | undefined;
  readonly maxCommentsPerPost: number | undefined;
  readonly commentDepth: number;
  readonly commentSort: NonNullable<RedditScanPass["commentSort"]>;
};

export type RedditScanCandidate = {
  readonly item: FetchedSourceItem;
  readonly post: RedditPost;
  readonly commentExpansion?: RedditSelectedPostCommentExpansion;
};

export type RedditConversationExpansionResult = {
  readonly conversationUnits: readonly FetchedConversationUnit[];
  readonly warnings: readonly string[];
};

export type NormalizedRedditPostResult = {
  readonly items: readonly FetchedSourceItem[];
  readonly conversationUnits: readonly FetchedConversationUnit[];
  readonly warnings: readonly string[];
};

export const selectedCommentExpansionForPass = (params: {
  readonly pass: RedditScanPass;
  readonly fallbackIncludeComments: boolean;
  readonly fallbackMaxCommentsPerPost: number | undefined;
  readonly fallbackCommentDepth: number;
  readonly fallbackCommentSort: NonNullable<RedditScanPass["commentSort"]>;
  readonly minScore: number | undefined;
}): RedditSelectedPostCommentExpansion | undefined => {
  const includeComments =
    params.pass.includeComments ?? params.fallbackIncludeComments;

  if (!includeComments) {
    return undefined;
  }

  return {
    minScore: params.minScore,
    maxCommentsPerPost:
      params.pass.maxCommentsPerPost ?? params.fallbackMaxCommentsPerPost,
    commentDepth: params.pass.commentDepth ?? params.fallbackCommentDepth,
    commentSort: params.pass.commentSort ?? params.fallbackCommentSort,
  };
};

export const withMergedRedditCommentExpansion = (
  candidate: RedditScanCandidate,
  expansion: RedditSelectedPostCommentExpansion | undefined,
): RedditScanCandidate => {
  if (expansion === undefined) {
    return candidate;
  }

  if (candidate.commentExpansion === undefined) {
    return { ...candidate, commentExpansion: expansion };
  }

  return {
    ...candidate,
    commentExpansion: mergeCommentExpansion(
      candidate.commentExpansion,
      expansion,
    ),
  };
};

export const fetchSelectedRedditCandidateComments = async (params: {
  readonly client: RedditClientPort;
  readonly accessToken: string;
  readonly userAgent: string | undefined;
  readonly candidates: readonly RedditScanCandidate[];
}): Promise<RedditConversationExpansionResult> => {
  const conversationUnitsByProviderUnitId = new Map<
    string,
    FetchedConversationUnit
  >();
  const warnings: string[] = [];

  for (const candidate of params.candidates) {
    const expansion = candidate.commentExpansion;
    if (expansion === undefined) {
      continue;
    }

    let comments: RedditCommentPage;
    try {
      comments = await params.client.listPostComments({
        accessToken: params.accessToken,
        userAgent: params.userAgent,
        postId: candidate.post.id,
        subreddit: candidate.post.subreddit,
        limit: expansion.maxCommentsPerPost ?? 5,
        depth: expansion.commentDepth,
        sort: expansion.commentSort,
      });
    } catch (error) {
      warnings.push(formatSelectedCommentWarning(candidate, error));
      continue;
    }

    for (const unit of comments.comments.flatMap((comment) =>
      normalizeComment(comment, candidate.post, expansion.minScore),
    )) {
      if (!conversationUnitsByProviderUnitId.has(unit.providerUnitId)) {
        conversationUnitsByProviderUnitId.set(unit.providerUnitId, unit);
      }
    }
  }

  return {
    conversationUnits: [...conversationUnitsByProviderUnitId.values()],
    warnings,
  };
};

export const normalizeRedditPostsWithOptionalComments = async (params: {
  readonly client: RedditClientPort;
  readonly accessToken: string;
  readonly userAgent: string | undefined;
  readonly posts: readonly RedditPost[];
  readonly minScore: number | undefined;
  readonly includeComments: boolean;
  readonly maxCommentsPerPost: number | undefined;
  readonly commentDepth: number;
  readonly commentSort: NonNullable<RedditScanPass["commentSort"]>;
}): Promise<NormalizedRedditPostResult> => {
  const items: FetchedSourceItem[] = [];
  const conversationUnits: FetchedConversationUnit[] = [];
  const warnings: string[] = [];

  for (const post of params.posts) {
    const normalizedPostItems = normalizePost(post, params.minScore);
    items.push(...normalizedPostItems);

    const rootItem = normalizedPostItems[0];
    if (rootItem === undefined || !params.includeComments) {
      continue;
    }

    let comments: RedditCommentPage;
    try {
      comments = await params.client.listPostComments({
        accessToken: params.accessToken,
        userAgent: params.userAgent,
        postId: post.id,
        subreddit: post.subreddit,
        limit: params.maxCommentsPerPost ?? 5,
        depth: params.commentDepth,
        sort: params.commentSort,
      });
    } catch (error) {
      warnings.push(
        formatSelectedCommentWarning({ item: rootItem, post }, error),
      );
      continue;
    }

    conversationUnits.push(
      ...comments.comments.flatMap((comment) =>
        normalizeComment(comment, post, params.minScore),
      ),
    );
  }

  return { items, conversationUnits, warnings };
};

const formatSelectedCommentWarning = (
  candidate: RedditScanCandidate,
  error: unknown,
): string => {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown Reddit comment enrichment error";

  return `Reddit comment enrichment degraded (${candidate.item.externalId}): ${redactSensitiveText(message)}`;
};

const mergeCommentExpansion = (
  left: RedditSelectedPostCommentExpansion,
  right: RedditSelectedPostCommentExpansion,
): RedditSelectedPostCommentExpansion => ({
  minScore: leastRestrictiveMinScore(left.minScore, right.minScore),
  maxCommentsPerPost: maxOptionalLimit(
    left.maxCommentsPerPost,
    right.maxCommentsPerPost,
  ),
  commentDepth: Math.max(left.commentDepth, right.commentDepth),
  commentSort: left.commentSort,
});

const leastRestrictiveMinScore = (
  left: number | undefined,
  right: number | undefined,
): number | undefined =>
  left === undefined || right === undefined ? undefined : Math.min(left, right);

const maxOptionalLimit = (
  left: number | undefined,
  right: number | undefined,
): number => Math.max(left ?? 5, right ?? 5);
