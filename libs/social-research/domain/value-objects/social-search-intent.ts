export const builtInSocialSourceKeys = [
  'reddit',
  'x-twitter',
  'youtube',
  'github',
  'hacker-news',
  'rss',
  'bluesky',
] as const;

export type BuiltInSocialSourceKey = (typeof builtInSocialSourceKeys)[number];
export type SocialSourceKey =
  | BuiltInSocialSourceKey
  | (string & { readonly __socialSourceKey?: never });

export const socialSearchDepths = ['light', 'balanced', 'deep'] as const;

export type SocialSearchDepth = (typeof socialSearchDepths)[number];

export const socialSearchGoals = [
  'research',
  'trend',
  'support',
  'competitor',
  'security',
] as const;

export type SocialSearchGoal = (typeof socialSearchGoals)[number];

export const socialSearchWindowPresets = ['24h', '7d', '30d'] as const;

export type SocialSearchWindowPreset =
  (typeof socialSearchWindowPresets)[number];

export type SocialSearchWindow =
  | SocialSearchWindowPreset
  | {
      readonly since?: string;
      readonly until?: string;
      readonly hours?: number;
      readonly days?: number;
    };

export type SocialAccountRef =
  | string
  | {
      readonly handle: string;
      readonly sourceKey?: SocialSourceKey;
      readonly includePosts?: boolean;
      readonly includeMentions?: boolean;
    };

export type SocialCommunityRef =
  | string
  | {
      readonly name: string;
      readonly sourceKey?: SocialSourceKey;
      readonly listings?: readonly SocialCommunityListing[];
    };

export const socialCommunityListings = ['top', 'hot', 'new'] as const;

export type SocialCommunityListing =
  (typeof socialCommunityListings)[number];

export type SocialSearchEntities = {
  readonly handles?: readonly SocialAccountRef[];
  readonly products?: readonly string[];
  readonly keywords?: readonly string[];
  readonly communities?: readonly SocialCommunityRef[];
  readonly urls?: readonly string[];
};

export type SocialSearchIntent = {
  readonly topic: string;
  readonly sources?: readonly SocialSourceKey[];
  readonly window?: SocialSearchWindow;
  readonly depth?: SocialSearchDepth;
  readonly goal?: SocialSearchGoal;
  readonly entities?: SocialSearchEntities;
};

export type NormalizedSocialAccountRef = {
  readonly handle: string;
  readonly sourceKey?: SocialSourceKey;
  readonly includePosts: boolean;
  readonly includeMentions: boolean;
};

export type NormalizedSocialCommunityRef = {
  readonly name: string;
  readonly sourceKey?: SocialSourceKey;
  readonly listings: readonly SocialCommunityListing[];
};
