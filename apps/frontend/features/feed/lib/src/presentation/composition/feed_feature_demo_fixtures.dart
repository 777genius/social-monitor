import '../../infrastructure/api/feed_item_api_dto.dart';

List<FeedItemApiDto> feedFeatureDemoItems() {
  return [
    _demoItem(
      order: 1,
      providerKey: 'github-repo-radar',
      title: 'openai/codex is trending across agent tooling',
      bodyPreview:
          'AI coding agent CLI gained +210 stars in 24h and +360 in 48h.',
      authorHandle: 'openai',
      canonicalUrl: 'https://github.com/openai/codex',
      providerMetadata: _githubRepositoryTrendMetadata(),
    ),
    _demoItem(
      order: 2,
      providerKey: 'reddit',
      title: 'Why pricing changes increased conversions',
      bodyPreview:
          'Users compare pricing changes and discuss conversion impact in a monitored thread.',
      authorHandle: 'u/startups',
      canonicalUrl: 'https://reddit.com/comments/demo1',
    ),
    _demoItem(
      order: 3,
      providerKey: 'rss',
      title: 'Competitor launches workflow automation update',
      bodyPreview:
          'A product update highlights workflow automation and migration support.',
      canonicalUrl: 'https://example.com/product-launch',
    ),
    _demoItem(
      order: 4,
      providerKey: 'hacker-news',
      title: 'Open source alternative gains attention',
      bodyPreview:
          'A technical discussion compares open source alternatives and integration quality.',
      authorHandle: 'hn-user',
      canonicalUrl: 'https://news.ycombinator.com/item?id=1003',
    ),
    _demoItem(
      order: 5,
      providerKey: 'reddit',
      title: 'Customers ask for monthly plan controls',
      bodyPreview:
          'Several comments ask for clearer controls around monthly billing and team seats.',
      authorHandle: 'u/ops_lead',
      canonicalUrl: 'https://reddit.com/comments/demo4',
    ),
    _demoItem(
      order: 6,
      providerKey: 'github-issues',
      title: 'Integration issue mentions missing webhook retry logs',
      bodyPreview:
          'A public issue asks for better retry visibility when webhook delivery fails.',
      authorHandle: 'dev-relay',
      canonicalUrl: 'https://github.com/example/product/issues/512',
    ),
    _demoItem(
      order: 7,
      providerKey: 'rss',
      title: 'Analyst note flags partner ecosystem expansion',
      bodyPreview:
          'The note calls out integrations and partner programs as the current buying trigger.',
      canonicalUrl: 'https://example.com/analyst-note',
    ),
    _demoItem(
      order: 8,
      providerKey: 'reddit',
      title: 'Migration guide praised for reducing setup time',
      bodyPreview:
          'Admins mention that a shorter migration guide removed a common trial blocker.',
      authorHandle: 'u/saas_ops',
      canonicalUrl: 'https://reddit.com/comments/demo7',
    ),
    _demoItem(
      order: 9,
      providerKey: 'hacker-news',
      title: 'Thread debates whether AI summaries need citations',
      bodyPreview:
          'Comments focus on provenance, quote safety and how to audit generated summaries.',
      authorHandle: 'throwaway-signal',
      canonicalUrl: 'https://news.ycombinator.com/item?id=1008',
    ),
    _demoItem(
      order: 10,
      providerKey: 'github-issues',
      title: 'Feature request proposes exportable evidence bundles',
      bodyPreview:
          'A customer asks to export monitored posts with timestamps and source links.',
      authorHandle: 'growth-admin',
      canonicalUrl: 'https://github.com/example/product/issues/529',
    ),
    _demoItem(
      order: 11,
      providerKey: 'rss',
      title: 'Competitor publishes enterprise security checklist',
      bodyPreview:
          'The checklist emphasizes audit logs, SSO enforcement and workspace isolation.',
      canonicalUrl: 'https://example.com/security-checklist',
    ),
    _demoItem(
      order: 12,
      providerKey: 'reddit',
      title: 'Users compare onboarding friction between tools',
      bodyPreview:
          'A subreddit discussion calls out import speed, templates and permission setup.',
      authorHandle: 'u/product_ops',
      canonicalUrl: 'https://reddit.com/comments/demo11',
    ),
    _demoItem(
      order: 13,
      providerKey: 'hacker-news',
      title: 'Launch post gets questions about source reliability',
      bodyPreview:
          'Readers ask how duplicate posts are grouped and how provider failures are surfaced.',
      authorHandle: 'builder42',
      canonicalUrl: 'https://news.ycombinator.com/item?id=1012',
    ),
    _demoItem(
      order: 14,
      providerKey: 'reddit',
      title: 'Pricing page copy causes confusion about seats',
      bodyPreview:
          'Multiple replies ask whether guest reviewers count toward paid seats.',
      authorHandle: 'u/revops_today',
      canonicalUrl: 'https://reddit.com/comments/demo13',
    ),
    _demoItem(
      order: 15,
      providerKey: 'rss',
      title: 'Newsletter highlights monitoring use cases for founders',
      bodyPreview:
          'The newsletter frames social monitoring as customer discovery and churn prevention.',
      canonicalUrl: 'https://example.com/newsletter-monitoring',
    ),
    _demoItem(
      order: 16,
      providerKey: 'github-issues',
      title: 'Discussion asks for Slack summary delivery',
      bodyPreview:
          'Teams want daily summaries pushed to a channel with links back to source posts.',
      authorHandle: 'ops-signal',
      canonicalUrl: 'https://github.com/example/product/discussions/88',
    ),
    _demoItem(
      order: 17,
      providerKey: 'reddit',
      title: 'Competitive thread mentions faster alert setup',
      bodyPreview:
          'Buyers compare setup time and say saved searches are the clearest first win.',
      authorHandle: 'u/b2b_founder',
      canonicalUrl: 'https://reddit.com/comments/demo16',
    ),
    _demoItem(
      order: 18,
      providerKey: 'hacker-news',
      title: 'Open source connectors attract technical users',
      bodyPreview:
          'The thread focuses on connector transparency, rate limits and self-hosted options.',
      authorHandle: 'infra-reader',
      canonicalUrl: 'https://news.ycombinator.com/item?id=1017',
    ),
    _demoItem(
      order: 19,
      providerKey: 'rss',
      title: 'Partner blog announces data retention controls',
      bodyPreview:
          'Retention windows and audit exports are presented as the compliance differentiator.',
      canonicalUrl: 'https://example.com/retention-controls',
    ),
    _demoItem(
      order: 20,
      providerKey: 'github-issues',
      title: 'Bug report describes duplicate Reddit items',
      bodyPreview:
          'A report includes steps where refreshed scans briefly show duplicate source items.',
      authorHandle: 'qa-market',
      canonicalUrl: 'https://github.com/example/product/issues/548',
    ),
    _demoItem(
      order: 21,
      providerKey: 'reddit',
      title: 'Community asks for competitor watch templates',
      bodyPreview:
          'Users share starter rules for pricing, launches, outages and integration mentions.',
      authorHandle: 'u/research_ops',
      canonicalUrl: 'https://reddit.com/comments/demo20',
    ),
    _demoItem(
      order: 22,
      providerKey: 'rss',
      title: 'Industry roundup names social listening as budget priority',
      bodyPreview:
          'The roundup says teams are consolidating monitoring and customer feedback tools.',
      canonicalUrl: 'https://example.com/industry-roundup',
    ),
    _demoItem(
      order: 23,
      providerKey: 'hacker-news',
      title: 'Engineers discuss ranking noisy social signals',
      bodyPreview:
          'Commenters prefer transparent ranking rules over black-box virality scores.',
      authorHandle: 'ranked-signal',
      canonicalUrl: 'https://news.ycombinator.com/item?id=1022',
    ),
    _demoItem(
      order: 24,
      providerKey: 'github-issues',
      title: 'Roadmap thread requests saved summary views',
      bodyPreview:
          'A team wants saved views for support, product marketing and competitor monitoring.',
      authorHandle: 'pm-workflow',
      canonicalUrl: 'https://github.com/example/product/discussions/94',
    ),
    _demoItem(
      order: 25,
      providerKey: 'reddit',
      title: 'Users want clearer export labels in reports',
      bodyPreview:
          'Feedback asks that exported citations show provider, author and capture time.',
      authorHandle: 'u/customer_voice',
      canonicalUrl: 'https://reddit.com/comments/demo24',
    ),
  ];
}

FeedItemApiDto _demoItem({
  required int order,
  required String providerKey,
  required String title,
  required String bodyPreview,
  required String canonicalUrl,
  String? authorHandle,
  Object? providerMetadata,
}) {
  final observedMinute = 60 - (order * 2);
  final metrics = _providerMetrics(providerKey, order);
  return FeedItemApiDto(
    id: 'feed-$order',
    topicId: order.isEven ? 'topic-demo' : 'topic-market-risk',
    sourceItemId: '$providerKey-item-$order',
    sourceBindingId: 'binding-$providerKey-demo',
    providerKey: providerKey,
    canonicalUrl: canonicalUrl,
    title: title,
    bodyPreview: bodyPreview,
    authorHandle: authorHandle,
    normalizedSignal: metrics == null ? null : _signal(providerKey, order),
    providerMetadata: providerMetadata,
    providerMetrics: metrics,
    publishedAt: DateTime.utc(2026, 6, 23, 10, observedMinute.clamp(0, 59)),
    observedAt: DateTime.utc(2026, 6, 23, 12, observedMinute.clamp(0, 59)),
  );
}

FeedSignalApiDto _signal(String providerKey, int order) {
  final provider = providerKey == 'github-repo-radar'
      ? ('repo-trending:24h', 'repository')
      : providerKey == 'hacker-news'
      ? ('hn:search', 'story')
      : ('r/startups', 'post');
  final score = switch (providerKey) {
    'github-repo-radar' => 91,
    'hacker-news' => 76 + (order % 3),
    _ => 68 + (order % 5),
  };

  return FeedSignalApiDto(
    score: score,
    band: score >= 85
        ? 'breakout'
        : score >= 55
        ? 'high'
        : 'normal',
    confidence: providerKey == 'reddit' ? 0.68 : 0.82,
    basis: 'cohort_baseline_v1',
    computedAt: DateTime.utc(2026, 6, 23, 12),
    cohort: FeedSignalCohortApiDto(
      providerKey: providerKey,
      sourceKey: provider.$1,
      contentType: provider.$2,
      ageBucket: '1-3h',
      baselineWindow: '24h',
      sampleSize: providerKey == 'reddit' ? 18 : 34,
      percentile: score / 100,
      zScore: 1.1,
      fallback: 'exact',
    ),
  );
}

Map<String, Object?>? _providerMetrics(String providerKey, int order) {
  return switch (providerKey) {
    'reddit' => {
      'kind': 'reddit_post',
      'providerKey': 'reddit',
      'sourceKey': 'r/startups',
      'contentType': 'post',
      'score': 40 + order * 2,
      'comments': 8 + order,
      'upvoteRatio': 0.9,
    },
    'github-repo-radar' => {
      'kind': 'github_repository',
      'providerKey': 'github-repo-radar',
      'sourceKey': 'repo-trending:24h',
      'contentType': 'repository',
      'stars': 54000,
      'forks': 6100,
      'trendingDelta': {'window': '24h', 'value': 210},
      'trendDeltas': [
        {'window': '24h', 'value': 210},
        {'window': '48h', 'value': 360},
        {'window': '7d', 'value': 1200},
        {'window': '30d', 'value': 4800},
        {'window': '90d', 'value': 11000},
      ],
    },
    'hacker-news' => {
      'kind': 'hacker_news_story',
      'providerKey': 'hacker-news',
      'sourceKey': 'hn:search',
      'contentType': 'story',
      'points': 80 + order * 3,
      'comments': 12 + order,
    },
    _ => null,
  };
}

Map<String, Object?> _githubRepositoryTrendMetadata() {
  return {
    'kind': 'github_repository_trend',
    'repository': {
      'fullName': 'openai/codex',
      'url': 'https://github.com/openai/codex',
      'description': 'AI coding agent CLI and developer workflow tooling.',
      'language': 'TypeScript',
      'topics': ['ai', 'agents', 'developer-tools'],
      'license': 'Apache-2.0',
      'forksCount': 6100,
    },
    'trend': {
      'totalStars': 54000,
      'stars24h': 210,
      'stars48h': 360,
      'stars7d': 1200,
      'stars30d': 4800,
      'stars90d': 11000,
      'rank': 1,
      'primaryWindow': '24h',
      'checkedAt': '2026-06-23T12:00:00.000Z',
      'source': 'gh_archive_bigquery_plus_github_live',
    },
  };
}
