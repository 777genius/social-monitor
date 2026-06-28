String readerSummaryProviderLabel(String providerKey) {
  return switch (providerKey.toLowerCase()) {
    'github-trending-page' => 'GitHub Trending',
    'github-repo-radar' => 'Repo Radar',
    'github-issues' || 'github' => 'GitHub',
    'hacker-news' || 'hn' => 'Hacker News',
    'reddit' => 'Reddit',
    'rss' => 'RSS',
    'x-twitter' || 'twitter' => 'X/Twitter',
    _ => providerKey,
  };
}
