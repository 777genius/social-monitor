import { redactSensitiveText } from "@social-monitor/shared-kernel";

import type {
  FetchedConversationUnit,
  FetchedSourceItem,
} from "../../../ports";
import type {
  HackerNewsClientPort,
  HackerNewsStory,
} from "./hacker-news-client.port";
import {
  normalizeHackerNewsCommentConversationUnit,
  normalizeHackerNewsStory,
} from "./hacker-news-item-normalizer";
import type { HackerNewsScanPass } from "./hacker-news-scan-pass-support";

export type HackerNewsCommentExpansion = {
  readonly maxCommentedStories: number | undefined;
  readonly maxCommentsPerPost: number | undefined;
  readonly commentDepth: number;
};

export type NormalizedHackerNewsStoriesResult = {
  readonly items: readonly FetchedSourceItem[];
  readonly conversationUnits: readonly FetchedConversationUnit[];
  readonly warnings: readonly string[];
};

export const commentExpansionForHackerNewsPass = (params: {
  readonly pass: HackerNewsScanPass;
  readonly fallbackIncludeComments: boolean;
  readonly fallbackMaxCommentedStories: number | undefined;
  readonly fallbackMaxCommentsPerPost: number | undefined;
  readonly fallbackCommentDepth: number;
}): HackerNewsCommentExpansion | undefined => {
  const includeComments =
    params.pass.includeComments ?? params.fallbackIncludeComments;

  if (!includeComments) {
    return undefined;
  }

  return {
    maxCommentedStories:
      params.pass.maxCommentedStories ?? params.fallbackMaxCommentedStories,
    maxCommentsPerPost:
      params.pass.maxCommentsPerPost ?? params.fallbackMaxCommentsPerPost,
    commentDepth: params.pass.commentDepth ?? params.fallbackCommentDepth,
  };
};

export const normalizeHackerNewsStoriesWithOptionalComments = async (params: {
  readonly client: HackerNewsClientPort;
  readonly stories: readonly HackerNewsStory[];
  readonly sourceKey: string;
  readonly searchQuery: string | undefined;
  readonly includeComments: boolean;
  readonly maxCommentedStories: number | undefined;
  readonly maxCommentsPerPost: number | undefined;
  readonly commentDepth: number;
}): Promise<NormalizedHackerNewsStoriesResult> => {
  const expansion = params.includeComments
    ? {
        maxCommentedStories: params.maxCommentedStories,
        maxCommentsPerPost: params.maxCommentsPerPost,
        commentDepth: params.commentDepth,
      }
    : undefined;

  return normalizeStoriesWithCommentExpansion({
    ...params,
    expansion,
  });
};

export const normalizeHackerNewsCommentSearchPass = async (params: {
  readonly client: HackerNewsClientPort;
  readonly rootStoriesById: Map<number, HackerNewsStory | null>;
  readonly comments: readonly HackerNewsStory[];
  readonly sourceKey: string;
  readonly searchQuery: string | undefined;
}): Promise<NormalizedHackerNewsStoriesResult> => {
  const items: FetchedSourceItem[] = [];
  const conversationUnits = new Map<string, FetchedConversationUnit>();
  const warnings: string[] = [];

  for (const comment of params.comments) {
    if (comment.kind !== "comment" || comment.storyId === undefined) {
      continue;
    }

    const rootStory = await readHackerNewsRootStory({
      client: params.client,
      rootStoriesById: params.rootStoriesById,
      storyId: comment.storyId,
      commentId: comment.id,
      warnings,
    });

    if (rootStory === null) {
      continue;
    }

    const rootItems = normalizeHackerNewsStory(
      rootStory,
      params.sourceKey,
      params.searchQuery,
    );
    if (rootItems.length === 0) {
      warnings.push(
        `Hacker News comment root story was not projectable (comment:${comment.id}); comment skipped.`,
      );
      continue;
    }

    items.push(...rootItems);
    for (const unit of normalizeHackerNewsCommentConversationUnit(
      comment,
      rootStory,
      params.sourceKey,
      params.searchQuery,
    )) {
      conversationUnits.set(unit.providerUnitId, unit);
    }
  }

  return {
    items,
    conversationUnits: [...conversationUnits.values()],
    warnings,
  };
};

const normalizeStoriesWithCommentExpansion = async (params: {
  readonly client: HackerNewsClientPort;
  readonly stories: readonly HackerNewsStory[];
  readonly sourceKey: string;
  readonly searchQuery: string | undefined;
  readonly expansion: HackerNewsCommentExpansion | undefined;
}): Promise<NormalizedHackerNewsStoriesResult> => {
  const items: FetchedSourceItem[] = [];
  const conversationUnits: FetchedConversationUnit[] = [];
  const warnings: string[] = [];
  let commentedStoryCount = 0;

  for (const story of params.stories) {
    const rootItems = normalizeHackerNewsStory(
      story,
      params.sourceKey,
      params.searchQuery,
    );
    items.push(...rootItems);

    const rootItem = rootItems[0];
    if (
      rootItem === undefined ||
      params.expansion === undefined ||
      commentedStoryCount >=
        (params.expansion.maxCommentedStories ?? Number.POSITIVE_INFINITY)
    ) {
      continue;
    }
    commentedStoryCount += 1;

    let comments: readonly HackerNewsStory[];
    try {
      comments = await params.client.listStoryComments({
        storyId: story.id,
        limit: params.expansion.maxCommentsPerPost ?? 5,
        depth: params.expansion.commentDepth,
      });
    } catch (error) {
      warnings.push(formatCommentEnrichmentWarning(rootItem, error));
      continue;
    }

    conversationUnits.push(
      ...comments.flatMap((comment) =>
        normalizeHackerNewsCommentConversationUnit(
          comment,
          story,
          params.sourceKey,
          params.searchQuery,
        ),
      ),
    );
  }

  return { items, conversationUnits, warnings };
};

const readHackerNewsRootStory = async (params: {
  readonly client: HackerNewsClientPort;
  readonly rootStoriesById: Map<number, HackerNewsStory | null>;
  readonly storyId: number;
  readonly commentId: number;
  readonly warnings: string[];
}): Promise<HackerNewsStory | null> => {
  if (params.rootStoriesById.has(params.storyId)) {
    return params.rootStoriesById.get(params.storyId) ?? null;
  }

  try {
    const rootStory = await params.client.getStory(params.storyId);
    params.rootStoriesById.set(params.storyId, rootStory);
    if (rootStory === null) {
      params.warnings.push(
        `Hacker News comment root story was unavailable (comment:${params.commentId}); comment skipped.`,
      );
    }

    return rootStory;
  } catch (error) {
    params.rootStoriesById.set(params.storyId, null);
    const message =
      error instanceof Error
        ? error.message
        : "Unknown Hacker News root story lookup error";
    params.warnings.push(
      `Hacker News comment root story lookup degraded (comment:${params.commentId}): ${redactSensitiveText(message)}`,
    );

    return null;
  }
};

const formatCommentEnrichmentWarning = (
  item: FetchedSourceItem,
  error: unknown,
): string => {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown Hacker News comment enrichment error";

  return `Hacker News comment enrichment degraded (${item.externalId}): ${redactSensitiveText(message)}`;
};
