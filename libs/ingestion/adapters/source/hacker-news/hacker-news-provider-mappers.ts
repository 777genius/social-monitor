import { stripHtml } from './hacker-news-query-match';
import type { HackerNewsStory } from './hacker-news-client.port';
import type { AlgoliaHit } from './hacker-news-algolia-contracts';

export const normalizeAlgoliaHit = (
  hit: AlgoliaHit,
  kind: 'story' | 'comment',
): readonly HackerNewsStory[] => {
  const id = Number(hit.objectID);
  if (!Number.isInteger(id)) {
    return [];
  }
  const storyId = readOptionalInteger(hit.story_id);
  const parentId = readOptionalInteger(hit.parent_id);
  const text = cleanOptionalText(hit.story_text ?? hit.comment_text);
  const score = readOptionalInteger(hit.points);
  const comments = readOptionalInteger(hit.num_comments);

  return [{
    kind,
    id,
    ...(hit.title === undefined ? {} : { title: hit.title }),
    ...(hit.story_title === undefined ? {} : { storyTitle: hit.story_title }),
    ...(storyId === undefined ? {} : { storyId }),
    ...(parentId === undefined ? {} : { parentId }),
    ...(hit.url === undefined ? {} : { url: hit.url }),
    ...(hit.author === undefined ? {} : { by: hit.author }),
    ...(hit.created_at_i === undefined ? {} : { time: hit.created_at_i }),
    ...(text === undefined ? {} : { text }),
    ...(score === undefined ? {} : { score }),
    ...(comments === undefined ? {} : { comments }),
  }];
};

export const normalizeFirebaseStory = (story: Readonly<Record<string, unknown>>): HackerNewsStory | null => {
  const id = readOptionalInteger(story.id);
  if (id === undefined) {
    return null;
  }
  const kind = readFirebaseKind(story.type);
  const parentId = readOptionalInteger(story.parent);
  const kids = readOptionalIntegerArray(story.kids);

  return {
    ...(kind === undefined ? {} : { kind }),
    id,
    title: readOptionalString(story.title),
    ...(parentId === undefined ? {} : { parentId }),
    ...(kids === undefined ? {} : { kids }),
    url: readOptionalString(story.url),
    by: readOptionalString(story.by),
    time: readOptionalInteger(story.time),
    text: cleanOptionalText(readOptionalString(story.text)),
    score: readOptionalInteger(story.score),
    comments: readOptionalInteger(story.descendants),
    deleted: story.deleted === true,
    dead: story.dead === true,
  };
};

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const readFirebaseKind = (value: unknown): 'story' | 'comment' | undefined => {
  if (value === 'comment') {
    return 'comment';
  }

  return value === 'story' || value === 'job' || value === 'poll'
    ? 'story'
    : undefined;
};

const readOptionalIntegerArray = (
  value: unknown,
): readonly number[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((item): item is number => Number.isInteger(item));
};

const cleanOptionalText = (value: string | undefined): string | undefined =>
  value === undefined ? undefined : stripHtml(value);

const readOptionalInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) ? value : undefined;

export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

