import type {
  SocialAccountRef,
  SocialCommunityRef,
  SocialSearchDepth,
  SocialSearchGoal,
  SocialSearchIntent,
  SocialSearchWindow,
  SocialSourceKey,
} from '../domain/value-objects/social-search-intent';

export const socialResearchRequestPresetIds = [
  'broad_research',
  'trend_scan',
  'support_watch',
  'competitor_scan',
] as const;

export type SocialResearchRequestPresetId =
  (typeof socialResearchRequestPresetIds)[number];

export type SocialResearchRequestInput = {
  readonly topic: string;
  readonly preset?: SocialResearchRequestPresetId;
  readonly sources?: SocialSourceKey | readonly SocialSourceKey[];
  readonly window?: SocialSearchWindow;
  readonly depth?: SocialSearchDepth;
  readonly goal?: SocialSearchGoal;
  readonly accounts?: SocialAccountRef | readonly SocialAccountRef[];
  readonly handles?: SocialAccountRef | readonly SocialAccountRef[];
  readonly products?: string | readonly string[];
  readonly keywords?: string | readonly string[];
  readonly communities?: SocialCommunityRef | readonly SocialCommunityRef[];
  readonly urls?: string | readonly string[];
};

export const createSocialSearchIntent = (
  input: SocialResearchRequestInput,
): SocialSearchIntent => {
  const preset = presetDefaults(input.preset);
  const entities = emptyEntitiesAsUndefined({
    handles: normalizeAccounts([
      ...asArray(input.accounts),
      ...asArray(input.handles),
    ]),
    products: normalizeStringList(input.products),
    keywords: normalizeStringList(input.keywords),
    communities: normalizeCommunities(input.communities),
    urls: normalizeStringList(input.urls),
  });

  return {
    topic: input.topic.trim(),
    sources: normalizeSourceKeys(input.sources),
    window: input.window ?? preset.window,
    depth: input.depth ?? preset.depth,
    goal: input.goal ?? preset.goal,
    ...(entities === undefined ? {} : { entities }),
  };
};

const presetDefaults = (
  preset: SocialResearchRequestPresetId | undefined,
): {
  readonly window: SocialSearchWindow;
  readonly depth: SocialSearchDepth;
  readonly goal: SocialSearchGoal;
} => {
  if (preset === 'trend_scan') {
    return {
      window: '7d',
      depth: 'light',
      goal: 'trend',
    };
  }

  if (preset === 'support_watch') {
    return {
      window: '24h',
      depth: 'balanced',
      goal: 'support',
    };
  }

  if (preset === 'competitor_scan') {
    return {
      window: '30d',
      depth: 'deep',
      goal: 'competitor',
    };
  }

  return {
    window: '30d',
    depth: 'balanced',
    goal: 'research',
  };
};

const asArray = <T>(value: T | readonly T[] | undefined): readonly T[] => {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? (value as readonly T[]) : [value as T];
};

const normalizeSourceKeys = (
  sources: SocialResearchRequestInput['sources'],
): readonly SocialSourceKey[] | undefined => {
  const normalized = compactUnique(
    asArray(sources)
      .map((source) => source.trim())
      .filter((source) => source.length > 0),
  ) as readonly SocialSourceKey[];

  return normalized.length === 0 ? undefined : normalized;
};

const normalizeStringList = (
  values: string | readonly string[] | undefined,
): readonly string[] | undefined => {
  const normalized = compactUnique(
    asArray(values)
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );

  return normalized.length === 0 ? undefined : normalized;
};

const normalizeAccounts = (
  accounts: readonly SocialAccountRef[],
): readonly SocialAccountRef[] | undefined => {
  const normalized: SocialAccountRef[] = [];

  for (const account of accounts) {
    if (typeof account === 'string') {
      const handle = account.trim();

      if (handle.length > 0) {
        normalized.push(handle);
      }
      continue;
    }

    const handle = account.handle.trim();

    if (handle.length > 0) {
      normalized.push({
        ...account,
        handle,
        ...(account.sourceKey === undefined
          ? {}
          : { sourceKey: account.sourceKey.trim() as SocialSourceKey }),
      });
    }
  }

  return normalized.length === 0 ? undefined : normalized;
};

const normalizeCommunities = (
  communities: SocialResearchRequestInput['communities'],
): readonly SocialCommunityRef[] | undefined => {
  const normalized: SocialCommunityRef[] = [];

  for (const community of asArray(communities)) {
    if (typeof community === 'string') {
      const name = community.trim();

      if (name.length > 0) {
        normalized.push(name);
      }
      continue;
    }

    const name = community.name.trim();

    if (name.length > 0) {
      normalized.push({
        ...community,
        name,
        ...(community.sourceKey === undefined
          ? {}
          : { sourceKey: community.sourceKey.trim() as SocialSourceKey }),
      });
    }
  }

  return normalized.length === 0 ? undefined : normalized;
};

const emptyEntitiesAsUndefined = (
  entities: NonNullable<SocialSearchIntent['entities']>,
): SocialSearchIntent['entities'] =>
  Object.values(entities).every((value) => value === undefined)
    ? undefined
    : entities;

const compactUnique = <T extends string>(values: readonly T[]): readonly T[] => [
  ...new Set(values),
];
