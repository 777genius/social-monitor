export const repositoryTrendPromptBlock = (
  metadata: unknown,
): Record<string, unknown> | undefined => {
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    Array.isArray(metadata)
  ) {
    return undefined;
  }

  const record = metadata as Readonly<Record<string, unknown>>;
  if (record.kind !== 'github_repository_trend') {
    return undefined;
  }

  return {
    repository: record.repository,
    trend: record.trend,
    instruction:
      'Use this as structured repository trend evidence. Cite the related evidence item.',
  };
};

export const repositorySignalPromptBlock = (
  metadata: unknown,
): Record<string, unknown> | undefined => {
  if (
    typeof metadata !== 'object' ||
    metadata === null ||
    Array.isArray(metadata)
  ) {
    return undefined;
  }

  const record = metadata as Readonly<Record<string, unknown>>;
  if (record.kind === 'github_repository_trend') {
    return {
      source: 'gh_archive_repo_radar',
      repository: record.repository,
      trend: record.trend,
      instruction:
        'Use this as objective GH Archive repository trend evidence. Preserve the window labels and cite the item.',
    };
  }

  if (record.kind === 'github_trending_page_repository') {
    return {
      source: 'github_trending_page',
      repository: record.repository,
      trending: record.trending,
      instruction:
        'Use this as GitHub Trending page rank evidence. Preserve rank, stars gained and window label, and cite the item.',
    };
  }

  return undefined;
};
