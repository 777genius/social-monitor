String readerBriefingProviderLabel(String providerKey) {
  return switch (providerKey.toLowerCase()) {
    'github-trending-page' => 'GitHub Trending - github.com/trending page',
    'github-repo-radar' => 'Repo Radar - GH Archive WatchEvent',
    'github-issues' || 'github' => 'GitHub',
    'hacker-news' || 'hn' => 'Hacker News',
    'reddit' => 'Reddit',
    'rss' => 'RSS',
    _ => providerKey,
  };
}
