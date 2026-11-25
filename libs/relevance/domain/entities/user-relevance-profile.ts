import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type RelevanceWeight = {
  readonly key: string;
  readonly weight: number;
};

export type UserRelevanceProfileProps = {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly interestWeights: readonly RelevanceWeight[];
  readonly sourceWeights: readonly RelevanceWeight[];
  readonly keywordWeights: readonly RelevanceWeight[];
  readonly mutedKeywords: readonly string[];
  readonly blockedProviderKeys: readonly string[];
  readonly rulesVersion: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type UserRelevanceProfileUpdate = {
  readonly interestWeights?: readonly RelevanceWeight[];
  readonly sourceWeights?: readonly RelevanceWeight[];
  readonly keywordWeights?: readonly RelevanceWeight[];
  readonly mutedKeywords?: readonly string[];
  readonly blockedProviderKeys?: readonly string[];
  readonly updatedAt: Date;
  readonly rulesVersion?: string;
};

export type RelevanceFeedbackAdjustment = {
  readonly interestId: string;
  readonly providerKey: string;
  readonly keywords: readonly string[];
  readonly direction: 'positive' | 'negative' | 'block_provider';
  readonly adjustedAt: Date;
};

const minWeight = -3;
const maxWeight = 3;
const defaultRulesVersion = 'relevance.rules.profile.v1';

export class UserRelevanceProfile {
  private constructor(private readonly props: UserRelevanceProfileProps) {}

  static create(
    props: Omit<UserRelevanceProfileProps, 'rulesVersion'> & { readonly rulesVersion?: string },
  ): UserRelevanceProfile {
    return UserRelevanceProfile.rehydrate({
      ...props,
      rulesVersion: props.rulesVersion ?? defaultRulesVersion,
    });
  }

  static rehydrate(props: UserRelevanceProfileProps): UserRelevanceProfile {
    const normalized = normalizeProps(props);

    return new UserRelevanceProfile(normalized);
  }

  update(update: UserRelevanceProfileUpdate): UserRelevanceProfile {
    return UserRelevanceProfile.rehydrate({
      ...this.props,
      interestWeights: update.interestWeights ?? this.props.interestWeights,
      sourceWeights: update.sourceWeights ?? this.props.sourceWeights,
      keywordWeights: update.keywordWeights ?? this.props.keywordWeights,
      mutedKeywords: update.mutedKeywords ?? this.props.mutedKeywords,
      blockedProviderKeys: update.blockedProviderKeys ?? this.props.blockedProviderKeys,
      rulesVersion: update.rulesVersion ?? this.props.rulesVersion,
      updatedAt: update.updatedAt,
    });
  }

  applyFeedback(adjustment: RelevanceFeedbackAdjustment): UserRelevanceProfile {
    const delta = adjustment.direction === 'positive' ? 0.25 : -0.35;
    const nextBlockedProviders = adjustment.direction === 'block_provider'
      ? uniqueSorted([...this.props.blockedProviderKeys, normalizeKey(adjustment.providerKey)])
      : this.props.blockedProviderKeys;

    return this.update({
      interestWeights: adjustWeights(this.props.interestWeights, [adjustment.interestId], delta),
      sourceWeights: adjustWeights(this.props.sourceWeights, [adjustment.providerKey], delta),
      keywordWeights: adjustWeights(this.props.keywordWeights, adjustment.keywords, delta / 2),
      blockedProviderKeys: nextBlockedProviders,
      updatedAt: adjustment.adjustedAt,
    });
  }

  interestWeight(interestId: string): number {
    return findWeight(this.props.interestWeights, interestId);
  }

  sourceWeight(providerKey: string): number {
    return findWeight(this.props.sourceWeights, providerKey);
  }

  keywordWeight(keyword: string): number {
    return findWeight(this.props.keywordWeights, keyword);
  }

  isProviderBlocked(providerKey: string): boolean {
    return this.props.blockedProviderKeys.includes(normalizeKey(providerKey));
  }

  hasMutedKeyword(text: string): boolean {
    const normalized = normalizeText(text);

    return this.props.mutedKeywords.some((keyword) => normalized.includes(keyword));
  }

  toSnapshot(): UserRelevanceProfileProps {
    return { ...this.props };
  }
}

export const createDefaultUserRelevanceProfile = (props: {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly createdAt: Date;
}): UserRelevanceProfile =>
  UserRelevanceProfile.create({
    ...props,
    interestWeights: [],
    sourceWeights: [],
    keywordWeights: [],
    mutedKeywords: [],
    blockedProviderKeys: [],
    updatedAt: props.createdAt,
  });

const normalizeProps = (props: UserRelevanceProfileProps): UserRelevanceProfileProps => {
  const userId = props.userId.trim();

  if (props.id.trim().length === 0) {
    throw new Error('User relevance profile id must be non-empty');
  }

  if (userId.length === 0) {
    throw new Error('User relevance profile user id must be non-empty');
  }

  if (props.rulesVersion.trim().length === 0) {
    throw new Error('User relevance profile rules version must be non-empty');
  }

  if (props.updatedAt.getTime() < props.createdAt.getTime()) {
    throw new Error('User relevance profile updatedAt must not be before createdAt');
  }

  return {
    ...props,
    userId,
    interestWeights: normalizeWeights(props.interestWeights, 'interest weight'),
    sourceWeights: normalizeWeights(props.sourceWeights, 'source weight'),
    keywordWeights: normalizeWeights(props.keywordWeights, 'keyword weight'),
    mutedKeywords: uniqueSorted(props.mutedKeywords.map(normalizeKey).filter(Boolean)),
    blockedProviderKeys: uniqueSorted(props.blockedProviderKeys.map(normalizeKey).filter(Boolean)),
  };
};

const normalizeWeights = (weights: readonly RelevanceWeight[], label: string): readonly RelevanceWeight[] => {
  const byKey = new Map<string, number>();

  for (const weight of weights) {
    const key = normalizeKey(weight.key);

    if (key.length === 0) {
      throw new Error(`${label} key must be non-empty`);
    }

    if (!Number.isFinite(weight.weight) || weight.weight < minWeight || weight.weight > maxWeight) {
      throw new Error(`${label} must be between ${minWeight} and ${maxWeight}`);
    }

    byKey.set(key, roundWeight(weight.weight));
  }

  return [...byKey.entries()]
    .map(([key, weight]) => ({ key, weight }))
    .sort((left, right) => left.key.localeCompare(right.key));
};

const adjustWeights = (
  weights: readonly RelevanceWeight[],
  keys: readonly string[],
  delta: number,
): readonly RelevanceWeight[] => {
  const byKey = new Map(weights.map((weight) => [weight.key, weight.weight]));

  for (const rawKey of keys) {
    const key = normalizeKey(rawKey);
    if (key.length === 0) {
      continue;
    }

    byKey.set(key, clampWeight((byKey.get(key) ?? 0) + delta));
  }

  return normalizeWeights([...byKey.entries()].map(([key, weight]) => ({ key, weight })), 'feedback weight');
};

const findWeight = (weights: readonly RelevanceWeight[], key: string): number =>
  weights.find((weight) => weight.key === normalizeKey(key))?.weight ?? 0;

const clampWeight = (value: number): number => roundWeight(Math.max(minWeight, Math.min(maxWeight, value)));

const roundWeight = (value: number): number => Math.round(value * 100) / 100;

const normalizeKey = (value: string): string => value.trim().toLocaleLowerCase('en-US');

const normalizeText = (value: string): string => value.trim().toLocaleLowerCase('en-US');

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));
