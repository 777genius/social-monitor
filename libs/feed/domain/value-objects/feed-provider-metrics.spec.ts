import {
  feedProviderMetricStrength,
  feedProviderMetricsFromMetadata,
} from './feed-provider-metrics';

describe('feedProviderMetricsFromMetadata', () => {
  it('maps Reddit raw score, comments and ratio without dropping negative scores', () => {
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: 'reddit',
      providerMetadata: {
        subreddit: 'TinySaaS',
        score: -3,
        numComments: 2,
        upvoteRatio: 0.41,
      },
    });

    expect(metrics).toEqual({
      kind: 'reddit_post',
      providerKey: 'reddit',
      sourceKey: 'r/tinysaas',
      contentType: 'post',
      score: -3,
      comments: 2,
      upvoteRatio: 0.41,
    });
    expect(metrics === undefined ? undefined : feedProviderMetricStrength(metrics)).toBeGreaterThan(0);
  });

  it('keeps Reddit ranking strength non-negative for zero engagement and low ratio', () => {
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: 'reddit',
      providerMetadata: {
        subreddit: 'TinySaaS',
        score: 0,
        numComments: 0,
        upvoteRatio: 0,
      },
    });

    expect(metrics).toEqual(expect.objectContaining({
      kind: 'reddit_post',
      score: 0,
      comments: 0,
      upvoteRatio: 0,
    }));
    expect(metrics === undefined ? undefined : feedProviderMetricStrength(metrics)).toBe(0);
  });

  it('maps GitHub repository totals and all available trend deltas', () => {
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: 'github-repo-radar',
      providerMetadata: {
        kind: 'github_repository_trend',
        repository: {
          forksCount: 6100,
        },
        trend: {
          totalStars: 54000,
          stars24h: 210,
          stars48h: 360,
          stars7d: 1200,
          stars30d: 4800,
          stars90d: 11000,
          primaryWindow: '24h',
        },
      },
    });

    expect(metrics).toEqual({
      kind: 'github_repository',
      providerKey: 'github-repo-radar',
      sourceKey: 'repo-trending:24h',
      contentType: 'repository',
      stars: 54000,
      forks: 6100,
      trendingDelta: {
        window: '24h',
        value: 210,
      },
      trendDeltas: [
        {
          window: '24h',
          value: 210,
        },
        {
          window: '48h',
          value: 360,
        },
        {
          window: '7d',
          value: 1200,
        },
        {
          window: '30d',
          value: 4800,
        },
        {
          window: '90d',
          value: 11000,
        },
      ],
    });
    expect(metrics === undefined ? undefined : feedProviderMetricStrength(metrics)).toBeGreaterThan(0);
  });

  it('maps Hacker News story points and comments', () => {
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: 'hacker-news',
      providerMetadata: {
        kind: 'hacker_news_story',
        source: 'firebase',
        points: 64,
        comments: 18,
      },
    });

    expect(metrics).toEqual({
      kind: 'hacker_news_story',
      providerKey: 'hacker-news',
      sourceKey: 'hn:firebase',
      contentType: 'story',
      points: 64,
      comments: 18,
    });
  });

  it('maps X API v2 public_metrics into public engagement counters', () => {
    const metrics = feedProviderMetricsFromMetadata({
      providerKey: 'x-twitter',
      providerMetadata: {
        kind: 'x_post',
        accountHandle: 'OpenAI',
        public_metrics: {
          like_count: 1200,
          retweet_count: 340,
          reply_count: 75,
          quote_count: 42,
          bookmark_count: 88,
          impression_count: 90000,
        },
      },
    });

    expect(metrics).toEqual({
      kind: 'x_post',
      providerKey: 'x-twitter',
      sourceKey: 'account:openai',
      contentType: 'post',
      likes: 1200,
      reposts: 340,
      replies: 75,
      quotes: 42,
      bookmarks: 88,
      impressions: 90000,
    });
  });

  it('does not fabricate metrics for unsupported or empty provider payloads', () => {
    expect(feedProviderMetricsFromMetadata({
      providerKey: 'rss',
      providerMetadata: {
        score: 10,
      },
    })).toBeUndefined();
    expect(feedProviderMetricsFromMetadata({
      providerKey: 'x-twitter',
      providerMetadata: {
        kind: 'x_post',
      },
    })).toBeUndefined();
  });
});
