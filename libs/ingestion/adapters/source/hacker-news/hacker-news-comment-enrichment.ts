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

type TargetWindow = { readonly startInclusive: Date; readonly endExclusive: Date };
const maxCommentParentHops = 32;

const commentInWindow = (comment: HackerNewsStory, window: TargetWindow): boolean =>
  comment.time !== undefined &&
  comment.time * 1000 >= window.startInclusive.getTime() &&
  comment.time * 1000 < window.endExclusive.getTime();

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
  readonly targetWindow?: TargetWindow;
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
  readonly targetWindow?: TargetWindow;
}): Promise<NormalizedHackerNewsStoriesResult> => {
  const items: FetchedSourceItem[] = [];
  const conversationUnits = new Map<string, FetchedConversationUnit>();
  const warnings: string[] = [];

  for (const comment of params.comments) {
    if (params.targetWindow !== undefined && !commentInWindow(comment, params.targetWindow)) {
      if (comment.time === undefined) warnings.push(`Hacker News comment missing timestamp (${comment.id}); comment skipped.`);
      continue;
    }
    if (comment.kind !== "comment") {
      continue;
    }

    const storyId = comment.storyId ?? await resolveHackerNewsCommentRootId({
      client: params.client,
      itemsById: params.rootStoriesById,
      comment,
      warnings,
    });
    if (storyId === null) continue;

    const rootStory = await readHackerNewsRootStory({
      client: params.client,
      rootStoriesById: params.rootStoriesById,
      storyId,
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
        `Hacker News comment coverage incomplete: root story was not projectable (comment:${comment.id}).`,
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
  readonly targetWindow?: TargetWindow;
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
    if (rootItem === undefined || params.expansion === undefined) {
      continue;
    }
    if (commentedStoryCount >= (params.expansion.maxCommentedStories ?? Number.POSITIVE_INFINITY)) {
      if (params.targetWindow !== undefined) warnings.push('Hacker News comment expansion incomplete: maxCommentedStories exceeded');
      continue;
    }
    commentedStoryCount += 1;

    let comments: readonly HackerNewsStory[];
    try {
      comments = await params.client.listStoryComments({
        storyId: story.id,
        limit: params.expansion.maxCommentsPerPost ?? 5,
        depth: params.expansion.commentDepth,
        requireComplete: params.targetWindow !== undefined,
      });
    } catch (error) {
      warnings.push(formatCommentEnrichmentWarning(rootItem, error));
      continue;
    }

    const boundedComments = params.targetWindow === undefined ? comments : comments.filter((comment) => {
      if (comment.time === undefined) warnings.push(`Hacker News comment missing timestamp (${comment.id}); comment skipped.`);
      return commentInWindow(comment, params.targetWindow!);
    });
    conversationUnits.push(
      ...boundedComments.flatMap((comment) =>
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

const resolveHackerNewsCommentRootId = async (params: {
  readonly client: HackerNewsClientPort;
  readonly itemsById: Map<number, HackerNewsStory | null>;
  readonly comment: HackerNewsStory;
  readonly warnings: string[];
}): Promise<number | null> => {
  const visited = new Set<number>([params.comment.id]);
  let parentId = params.comment.parentId;

  for (let hops = 0; hops < maxCommentParentHops; hops += 1) {
    if (parentId === undefined || !Number.isSafeInteger(parentId) || parentId <= 0) {
      params.warnings.push(`Hacker News comment coverage incomplete: parent unavailable (comment:${params.comment.id}).`);
      return null;
    }
    if (visited.has(parentId)) {
      params.warnings.push(`Hacker News comment coverage incomplete: parent cycle (comment:${params.comment.id}).`);
      return null;
    }
    visited.add(parentId);

    let parent = params.itemsById.get(parentId);
    if (!params.itemsById.has(parentId)) {
      try {
        parent = await params.client.getStory(parentId);
        params.itemsById.set(parentId, parent);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown Hacker News parent lookup error";
        params.warnings.push(`Hacker News comment coverage incomplete: parent lookup failed (comment:${params.comment.id}): ${redactSensitiveText(message)}`);
        return null;
      }
    }
    if (parent === null || parent === undefined || parent.id !== parentId) {
      params.warnings.push(`Hacker News comment coverage incomplete: parent unavailable (comment:${params.comment.id}).`);
      return null;
    }
    if (parent.kind === "comment") {
      parentId = parent.parentId;
      continue;
    }
    if (parent.kind === "story" || (parent.kind === undefined && parent.title !== undefined)) {
      return parent.id;
    }
    params.warnings.push(`Hacker News comment coverage incomplete: parent type unknown (comment:${params.comment.id}).`);
    return null;
  }

  params.warnings.push(`Hacker News comment coverage incomplete: parent depth exceeded (comment:${params.comment.id}).`);
  return null;
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
        `Hacker News comment coverage incomplete: root story was unavailable (comment:${params.commentId}).`,
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
      `Hacker News comment coverage incomplete: root story lookup failed (comment:${params.commentId}): ${redactSensitiveText(message)}`,
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
