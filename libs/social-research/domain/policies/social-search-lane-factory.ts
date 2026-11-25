import type { SocialSourceKey } from '../value-objects/social-search-intent';
import type {
  SocialSearchLane,
  SocialSearchLaneKind,
  SocialSearchLaneOperation,
} from '../value-objects/social-search-plan';
import {
  compactUnique,
  compactUniqueBy,
} from './social-search-planner-normalization';

export type SocialSearchLaneInput = {
  readonly sourceKey: SocialSourceKey;
  readonly kind: SocialSearchLaneKind;
  readonly operation: SocialSearchLaneOperation;
  readonly query: string;
  readonly priority: number;
  readonly maxItems: number;
  readonly reason: string;
  readonly budgetWeight?: number;
  readonly idSuffix?: string;
  readonly parameters?: Readonly<
    Record<string, string | number | boolean | readonly string[]>
  >;
};

export const lane = (params: SocialSearchLaneInput): SocialSearchLane => ({
  laneId: [
    params.sourceKey,
    params.kind,
    stableSlug(params.query),
    ...(params.idSuffix === undefined ? [] : [stableSlug(params.idSuffix)]),
  ].join(':'),
  sourceKey: params.sourceKey,
  kind: params.kind,
  operation: params.operation,
  query: params.query,
  priority: params.priority,
  maxItems: params.maxItems,
  budgetWeight: params.budgetWeight ?? 1,
  reason: params.reason,
  ...(params.parameters === undefined ? {} : { parameters: params.parameters }),
});

export const orGroup = (values: readonly string[]): string =>
  compactUnique(values).map(quoteIfNeeded).join(' OR ');

export const dedupeLanes = (
  lanes: readonly SocialSearchLane[],
): readonly SocialSearchLane[] =>
  compactUniqueBy(
    lanes,
    (laneItem) =>
      `${laneItem.sourceKey}:${laneItem.kind}:${laneItem.operation}:${laneItem.query}:${stableParameterFingerprint(laneItem.parameters)}`,
  );

const quoteIfNeeded = (value: string): string =>
  /\s/.test(value) && !/^".*"$/.test(value) ? `"${value}"` : value;

const stableSlug = (value: string): string => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return slug.length === 0 ? 'lane' : slug;
};

const stableParameterFingerprint = (
  parameters: SocialSearchLane['parameters'],
): string => {
  if (parameters === undefined) {
    return '';
  }

  return Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) =>
      Array.isArray(value)
        ? `${key}=[${value.join(',')}]`
        : `${key}=${String(value)}`,
    )
    .join(';');
};
