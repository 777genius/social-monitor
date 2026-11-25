import type { SocialSourceKey } from './social-search-intent';
import type {
  SocialSearchLaneKind,
  SocialSearchLaneOperation,
} from './social-search-plan';

export const socialSourceContentUnits = [
  'post',
  'comment',
  'profile',
  'community',
  'media',
  'link',
] as const;

export type SocialSourceContentUnit = (typeof socialSourceContentUnits)[number];

export const socialSourceCursorModels = [
  'none',
  'time',
  'page_token',
  'opaque',
  'since_id',
  'etag_last_modified',
] as const;

export type SocialSourceCursorModel = (typeof socialSourceCursorModels)[number];

export const socialSourceQuotaModels = [
  'none',
  'per_app',
  'per_credential',
  'per_tenant',
  'per_source_binding',
] as const;

export type SocialSourceQuotaModel = (typeof socialSourceQuotaModels)[number];

export const socialSourceReadinessStates = [
  'research_only',
  'profiled',
  'certification_ready',
  'enabled_beta',
  'provider_only',
  'manual_only',
  'rejected',
] as const;

export type SocialSourceReadinessState =
  (typeof socialSourceReadinessStates)[number];

export const socialSourceRuntimeReadinessStates = [
  'fixture_ready',
  'live_beta_ready',
  'deferred',
] as const;

export type SocialSourceRuntimeReadinessState =
  (typeof socialSourceRuntimeReadinessStates)[number];

export type SocialSourceReadinessSnapshot = {
  readonly state: SocialSourceReadinessState;
  readonly runtimeReadiness: SocialSourceRuntimeReadinessState;
  readonly liveBetaBlockers?: readonly string[];
};

export type SocialSourceCapabilityProfile = {
  readonly sourceKey: SocialSourceKey;
  readonly displayName?: string;
  readonly version: number;
  readonly productionSafe?: boolean;
  readonly supportedOperations: readonly SocialSearchLaneOperation[];
  readonly supportedLaneKinds?: readonly SocialSearchLaneKind[];
  readonly supportedContentUnits?: readonly SocialSourceContentUnit[];
  readonly cursorModel?: SocialSourceCursorModel;
  readonly quotaModel?: SocialSourceQuotaModel;
  readonly readiness?: SocialSourceReadinessSnapshot;
  readonly limitations?: readonly string[];
};

export const builtInSocialSourceCapabilityProfiles: readonly SocialSourceCapabilityProfile[] =
  [
    {
      sourceKey: 'reddit',
      displayName: 'Reddit',
      version: 1,
      productionSafe: true,
      supportedOperations: ['search', 'listing', 'enrichment'],
      supportedLaneKinds: [
        'general',
        'search_variant',
        'product_or_group',
        'keyword_group',
        'community_listing',
        'thread_enrichment',
        'fallback_short_query',
      ],
      supportedContentUnits: ['post', 'comment', 'community', 'link'],
      cursorModel: 'opaque',
      quotaModel: 'per_app',
      readiness: {
        state: 'enabled_beta',
        runtimeReadiness: 'fixture_ready',
        liveBetaBlockers: [
          'External beta requires deployed Reddit OAuth and rate-limit evidence.',
        ],
      },
      limitations: [
        'Official OAuth API path only; broad comment search is not assumed.',
      ],
    },
    {
      sourceKey: 'x-twitter',
      displayName: 'X/Twitter',
      version: 1,
      productionSafe: true,
      supportedOperations: ['search', 'account_feed', 'mention_search'],
      supportedLaneKinds: [
        'general',
        'product_or_group',
        'keyword_group',
        'account_posts',
        'account_mentions',
        'fallback_short_query',
      ],
      supportedContentUnits: ['post', 'media', 'link'],
      cursorModel: 'opaque',
      quotaModel: 'per_credential',
      readiness: {
        state: 'provider_only',
        runtimeReadiness: 'deferred',
        liveBetaBlockers: [
          'Product runtime must explicitly enable the private x-collector service.',
        ],
      },
      limitations: [
        'Private collector risk is kept outside SDK and transport contracts.',
      ],
    },
    {
      sourceKey: 'youtube',
      displayName: 'YouTube',
      version: 1,
      productionSafe: false,
      supportedOperations: ['search', 'enrichment'],
      supportedLaneKinds: [
        'general',
        'product_or_group',
        'keyword_group',
        'transcript_enrichment',
        'fallback_short_query',
      ],
      supportedContentUnits: ['media', 'link'],
      cursorModel: 'none',
      quotaModel: 'per_app',
      readiness: {
        state: 'research_only',
        runtimeReadiness: 'deferred',
      },
      limitations: [
        'Transcript availability is best-effort and source-specific.',
      ],
    },
    {
      sourceKey: 'github',
      displayName: 'GitHub',
      version: 1,
      productionSafe: true,
      supportedOperations: ['search'],
      supportedLaneKinds: [
        'general',
        'product_or_group',
        'keyword_group',
        'fallback_short_query',
      ],
      supportedContentUnits: ['post', 'comment', 'link'],
      cursorModel: 'page_token',
      quotaModel: 'per_app',
      readiness: {
        state: 'manual_only',
        runtimeReadiness: 'fixture_ready',
      },
      limitations: [
        'Concrete runtime provider can map this to GitHub issues or repo intelligence.',
      ],
    },
    {
      sourceKey: 'hacker-news',
      displayName: 'Hacker News',
      version: 1,
      productionSafe: true,
      supportedOperations: ['search', 'listing'],
      supportedLaneKinds: [
        'general',
        'product_or_group',
        'keyword_group',
        'fallback_short_query',
      ],
      supportedContentUnits: ['post', 'comment', 'link'],
      cursorModel: 'time',
      quotaModel: 'per_app',
      readiness: {
        state: 'enabled_beta',
        runtimeReadiness: 'fixture_ready',
      },
      limitations: [
        'Public Firebase listings and Algolia search; no credentials required.',
      ],
    },
    {
      sourceKey: 'rss',
      displayName: 'RSS/Atom',
      version: 1,
      productionSafe: true,
      supportedOperations: ['url'],
      supportedLaneKinds: ['url_feed'],
      supportedContentUnits: ['post', 'link'],
      cursorModel: 'etag_last_modified',
      quotaModel: 'per_source_binding',
      readiness: {
        state: 'enabled_beta',
        runtimeReadiness: 'fixture_ready',
      },
      limitations: [
        'Requires explicit feed URLs; keyword search is not assumed.',
      ],
    },
    {
      sourceKey: 'bluesky',
      displayName: 'Bluesky',
      version: 1,
      productionSafe: false,
      supportedOperations: ['search', 'account_feed', 'mention_search'],
      supportedLaneKinds: [
        'general',
        'product_or_group',
        'keyword_group',
        'account_posts',
        'account_mentions',
        'fallback_short_query',
      ],
      supportedContentUnits: ['post', 'profile', 'link'],
      cursorModel: 'opaque',
      quotaModel: 'per_app',
      readiness: {
        state: 'research_only',
        runtimeReadiness: 'deferred',
      },
      limitations: [
        'AT Protocol runtime adapter is not yet wired for product ingestion.',
      ],
    },
  ];
