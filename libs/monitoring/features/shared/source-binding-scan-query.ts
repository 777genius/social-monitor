import type { SourceBindingProps } from '../../domain';
import type {
  EnqueuedScanSourceQuery,
  EnqueuedScanSourceQueryMode,
} from '../../ports';

export const sourceBindingScanQuery = (
  binding: Pick<SourceBindingProps, 'id' | 'providerKey' | 'config'>,
): EnqueuedScanSourceQuery => {
  if (binding.providerKey === 'rss') {
    return {
      mode: 'url',
      query:
        firstNonEmptyString(
          binding.config.feedUrl,
          binding.config.url,
          binding.config.query,
        ) ?? binding.id,
    };
  }

  if (binding.providerKey === 'hacker-news') {
    const mode =
      normalizeMode(binding.config.mode, ['search', 'listing']) ?? 'search';

    return {
      mode,
      query:
        mode === 'listing'
          ? (firstNonEmptyString(
              binding.config.listing,
              binding.config.query,
            ) ?? 'top')
          : (firstNonEmptyString(binding.config.query, binding.config.term) ??
            binding.id),
    };
  }

  if (binding.providerKey === 'reddit') {
    const mode =
      normalizeMode(binding.config.mode, ['search', 'listing']) ?? 'search';

    return {
      mode,
      query:
        mode === 'listing'
          ? (firstNonEmptyString(
              binding.config.subreddit,
              binding.config.query,
            ) ?? binding.id)
          : (firstNonEmptyString(binding.config.query, binding.config.term) ??
            binding.id),
    };
  }

  if (
    binding.providerKey === 'github' ||
    binding.providerKey === 'github-issues'
  ) {
    return {
      mode: 'search',
      query:
        firstNonEmptyString(binding.config.query, binding.config.term) ??
        binding.id,
    };
  }

  if (binding.providerKey === 'github-repo-radar') {
    return {
      mode: 'search',
      query:
        firstNonEmptyString(
          binding.config.query,
          binding.config.term,
          firstStringArrayItem(binding.config.topics),
          firstStringArrayItem(binding.config.languages),
        ) ?? binding.id,
    };
  }

  if (binding.providerKey === 'github-trending-page') {
    return {
      mode: 'listing',
      query:
        firstNonEmptyString(
          binding.config.window,
          binding.config.since,
          binding.config.query,
        ) ?? 'daily',
    };
  }

  return {
    mode: normalizeMode(binding.config.mode, ['search', 'listing']) ?? 'search',
    query:
      firstNonEmptyString(binding.config.query, binding.config.term) ??
      binding.id,
  };
};

const firstStringArrayItem = (value: unknown): string | undefined =>
  Array.isArray(value)
    ? value
        .find(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        )
        ?.trim()
    : undefined;

const firstNonEmptyString = (
  ...values: readonly unknown[]
): string | undefined => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
};

const normalizeMode = (
  value: unknown,
  allowedModes: readonly EnqueuedScanSourceQueryMode[],
): EnqueuedScanSourceQueryMode | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  return allowedModes.includes(value as EnqueuedScanSourceQueryMode)
    ? (value as EnqueuedScanSourceQueryMode)
    : undefined;
};
