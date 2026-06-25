export const providerLabel = (providerKey: string): string => {
  switch (providerKey.toLowerCase()) {
    case 'github-trending-page':
      return 'GitHub Trending';
    case 'github-repo-radar':
      return 'Repo Radar';
    case 'github-issues':
    case 'github':
      return 'GitHub';
    case 'hacker-news':
    case 'hn':
      return 'Hacker News';
    case 'reddit':
      return 'Reddit';
    case 'rss':
      return 'RSS';
    default:
      return providerKey;
  }
};

export const plural = (count: number): string => (count === 1 ? '' : 's');
