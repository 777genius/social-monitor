String readerSummaryIndependentProviderFamily(String providerKey) {
  final normalized = providerKey.trim().toLowerCase();
  return switch (normalized) {
    'x' || 'x-twitter' || 'twitter' => 'x',
    'hacker_news' || 'hacker-news' || 'hn' => 'hacker-news',
    'github_radar' || 'github-repo-radar' => 'github-repo-radar',
    _ => normalized,
  };
}

Set<String> readerSummaryIndependentProviderFamilies(
  Iterable<String> providerKeys,
) {
  final families = <String>{};
  for (final providerKey in providerKeys) {
    final family = readerSummaryIndependentProviderFamily(providerKey);
    if (family.isNotEmpty) families.add(family);
  }
  return families;
}
