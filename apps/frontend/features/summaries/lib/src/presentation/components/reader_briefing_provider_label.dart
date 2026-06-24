String readerBriefingProviderLabel(String providerKey) {
  return switch (providerKey.toLowerCase()) {
    'github-repo-radar' => 'Repo Radar',
    'github-issues' || 'github' => 'GitHub',
    'hacker-news' || 'hn' => 'Hacker News',
    'reddit' => 'Reddit',
    'rss' => 'RSS',
    _ => providerKey,
  };
}
