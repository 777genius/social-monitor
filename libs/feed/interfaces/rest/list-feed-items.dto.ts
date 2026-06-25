import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';

export class FeedMetricDeltaDto {
  @ApiProperty()
  declare readonly window: string;

  @ApiProperty()
  declare readonly value: number;
}

export class RedditPostProviderMetricsDto {
  @ApiProperty({ enum: ['reddit_post'] })
  declare readonly kind: 'reddit_post';

  @ApiProperty({ enum: ['reddit'] })
  declare readonly providerKey: 'reddit';

  @ApiProperty()
  declare readonly sourceKey: string;

  @ApiProperty({ enum: ['post'] })
  declare readonly contentType: 'post';

  @ApiProperty()
  declare readonly score: number;

  @ApiProperty()
  declare readonly comments: number;

  @ApiPropertyOptional()
  declare readonly upvoteRatio?: number;
}

export class GitHubRepositoryProviderMetricsDto {
  @ApiProperty({ enum: ['github_repository'] })
  declare readonly kind: 'github_repository';

  @ApiProperty({ enum: ['github-repo-radar'] })
  declare readonly providerKey: 'github-repo-radar';

  @ApiProperty()
  declare readonly sourceKey: string;

  @ApiProperty({ enum: ['repository'] })
  declare readonly contentType: 'repository';

  @ApiProperty({ enum: ['gh_archive_watch_event'] })
  declare readonly evidenceSource: 'gh_archive_watch_event';

  @ApiProperty({
    description:
      'Human-readable source evidence label for Repo Radar freshness context.',
  })
  declare readonly evidenceLabel: string;

  @ApiProperty()
  declare readonly stars: number;

  @ApiProperty()
  declare readonly forks: number;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'When the GH Archive trend window was computed.',
  })
  declare readonly checkedAt?: string;

  @ApiPropertyOptional({
    description:
      'Internal normalized source marker, for example gh_archive_bigquery_plus_github_live.',
  })
  declare readonly source?: string;

  @ApiProperty({ type: () => FeedMetricDeltaDto })
  declare readonly trendingDelta: FeedMetricDeltaDto;

  @ApiProperty({ type: () => [FeedMetricDeltaDto] })
  declare readonly trendDeltas: readonly FeedMetricDeltaDto[];
}

export class GitHubTrendingRepositoryProviderMetricsDto {
  @ApiProperty({ enum: ['github_trending_repository'] })
  declare readonly kind: 'github_trending_repository';

  @ApiProperty({ enum: ['github-trending-page'] })
  declare readonly providerKey: 'github-trending-page';

  @ApiProperty()
  declare readonly sourceKey: string;

  @ApiProperty({ enum: ['repository'] })
  declare readonly contentType: 'repository';

  @ApiProperty()
  declare readonly stars: number;

  @ApiProperty()
  declare readonly forks: number;

  @ApiProperty()
  declare readonly rank: number;

  @ApiProperty()
  declare readonly starsGained: number;

  @ApiProperty({ enum: ['daily', 'weekly', 'monthly'] })
  declare readonly window: 'daily' | 'weekly' | 'monthly';
}

export class HackerNewsStoryProviderMetricsDto {
  @ApiProperty({ enum: ['hacker_news_story'] })
  declare readonly kind: 'hacker_news_story';

  @ApiProperty({ enum: ['hacker-news'] })
  declare readonly providerKey: 'hacker-news';

  @ApiProperty()
  declare readonly sourceKey: string;

  @ApiProperty({ enum: ['story'] })
  declare readonly contentType: 'story';

  @ApiProperty()
  declare readonly points: number;

  @ApiProperty()
  declare readonly comments: number;
}

export class XPostProviderMetricsDto {
  @ApiProperty({ enum: ['x_post'] })
  declare readonly kind: 'x_post';

  @ApiProperty({ enum: ['x-twitter'] })
  declare readonly providerKey: 'x-twitter';

  @ApiProperty()
  declare readonly sourceKey: string;

  @ApiProperty({ enum: ['post'] })
  declare readonly contentType: 'post';

  @ApiProperty()
  declare readonly likes: number;

  @ApiProperty()
  declare readonly reposts: number;

  @ApiProperty()
  declare readonly replies: number;

  @ApiProperty()
  declare readonly quotes: number;

  @ApiProperty()
  declare readonly bookmarks: number;

  @ApiProperty()
  declare readonly impressions: number;
}

export type FeedProviderMetricsDto =
  | RedditPostProviderMetricsDto
  | GitHubRepositoryProviderMetricsDto
  | GitHubTrendingRepositoryProviderMetricsDto
  | HackerNewsStoryProviderMetricsDto
  | XPostProviderMetricsDto;

const feedProviderMetricsOneOf = [
  { $ref: getSchemaPath(RedditPostProviderMetricsDto) },
  { $ref: getSchemaPath(GitHubRepositoryProviderMetricsDto) },
  { $ref: getSchemaPath(GitHubTrendingRepositoryProviderMetricsDto) },
  { $ref: getSchemaPath(HackerNewsStoryProviderMetricsDto) },
  { $ref: getSchemaPath(XPostProviderMetricsDto) },
];

export class FeedSignalCohortDto {
  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly sourceKey: string;

  @ApiProperty()
  declare readonly contentType: string;

  @ApiProperty()
  declare readonly ageBucket: string;

  @ApiProperty({ enum: ['24h', '7d', '30d', 'all'] })
  declare readonly baselineWindow: '24h' | '7d' | '30d' | 'all';

  @ApiProperty()
  declare readonly sampleSize: number;

  @ApiProperty()
  declare readonly percentile: number;

  @ApiProperty()
  declare readonly zScore: number;

  @ApiProperty({ enum: ['exact', 'source', 'provider_age', 'provider'] })
  declare readonly fallback: 'exact' | 'source' | 'provider_age' | 'provider';
}

export class FeedNormalizedSignalDto {
  @ApiProperty()
  declare readonly score: number;

  @ApiProperty({ enum: ['no_signal', 'low', 'normal', 'high', 'breakout'] })
  declare readonly band: 'no_signal' | 'low' | 'normal' | 'high' | 'breakout';

  @ApiProperty()
  declare readonly confidence: number;

  @ApiProperty({ enum: ['cohort_baseline_v1'] })
  declare readonly basis: 'cohort_baseline_v1';

  @ApiProperty({ format: 'date-time' })
  declare readonly computedAt: string;

  @ApiProperty({ type: () => FeedSignalCohortDto })
  declare readonly cohort: FeedSignalCohortDto;
}

@ApiExtraModels(
  FeedMetricDeltaDto,
  RedditPostProviderMetricsDto,
  GitHubRepositoryProviderMetricsDto,
  GitHubTrendingRepositoryProviderMetricsDto,
  HackerNewsStoryProviderMetricsDto,
  XPostProviderMetricsDto,
)
export class FeedItemDto {
  @ApiProperty()
  declare readonly id: string;

  @ApiProperty()
  declare readonly topicId: string;

  @ApiProperty()
  declare readonly sourceItemId: string;

  @ApiProperty()
  declare readonly sourceBindingId: string;

  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly canonicalUrl: string;

  @ApiProperty()
  declare readonly title: string;

  @ApiProperty()
  declare readonly bodyPreview: string;

  @ApiPropertyOptional()
  declare readonly authorHandle?: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly publishedAt: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly observedAt: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  declare readonly providerMetadata?: Readonly<Record<string, unknown>>;

  @ApiPropertyOptional({
    oneOf: feedProviderMetricsOneOf,
    discriminator: {
      propertyName: 'kind',
      mapping: {
        reddit_post: getSchemaPath(RedditPostProviderMetricsDto),
        github_repository: getSchemaPath(GitHubRepositoryProviderMetricsDto),
        github_trending_repository: getSchemaPath(
          GitHubTrendingRepositoryProviderMetricsDto,
        ),
        hacker_news_story: getSchemaPath(HackerNewsStoryProviderMetricsDto),
        x_post: getSchemaPath(XPostProviderMetricsDto),
      },
    },
  })
  declare readonly providerMetrics?: FeedProviderMetricsDto;

  @ApiPropertyOptional({ type: () => FeedNormalizedSignalDto })
  declare readonly normalizedSignal?: FeedNormalizedSignalDto;
}

export class ListFeedItemsResponseDto {
  @ApiProperty({ type: () => [FeedItemDto] })
  declare readonly items: readonly FeedItemDto[];

  @ApiPropertyOptional()
  declare readonly nextCursor?: string;
}

export class GetFeedItemResponseDto extends FeedItemDto {}
