import { readerPromotionProviderFamily, type JsonObject } from '@social-monitor/shared-kernel';

export type ReaderValueSourceKind = 'original_post' | 'story' | 'article' | 'repository' | 'trending_repository';
export type ReaderValueSourceKindResult =
  | { readonly supported: true; readonly kind: ReaderValueSourceKind; readonly appendixOnly: boolean }
  | { readonly supported: false; readonly reason: 'unsupported_kind' };

/** Assessment discovery is independent of legacy promotion metrics and semantic gates. */
export function classifyReaderValueSourceKind(providerKey: string, metadata: JsonObject): ReaderValueSourceKindResult {
  const key = providerKey.trim().toLowerCase();
  if (key === 'rss') return classify(metadata, ['rss_item'], ['article', 'rss_item'], 'article');
  if (key === 'github-trending-page') {
    return classify(metadata, ['github_trending_page_repository'], ['repository'], 'trending_repository');
  }
  switch (readerPromotionProviderFamily(key)) {
    case 'x':
      if (metadata.contentKind !== 'original_post') return unsupported();
      return classify(metadata, ['x_post', 'twitter_post'], ['original_post', 'post', 'x_post', 'twitter_post'], 'original_post');
    case 'reddit': return classify(metadata, ['reddit_post'], ['original_post', 'post'], 'original_post');
    case 'hacker_news': return classify(metadata, ['hacker_news_story'], ['story'], 'story');
    case 'github_radar': return classify(metadata, ['github_repository_trend'], ['repository'], 'repository');
    default: return unsupported();
  }
}

function classify(metadata: JsonObject, kinds: readonly string[], secondaryKinds: readonly string[],
  kind: ReaderValueSourceKind): ReaderValueSourceKindResult {
  if (typeof metadata.kind !== 'string' || !kinds.includes(metadata.kind)) return unsupported();
  if ([metadata.contentKind, metadata.contentType, metadata.type, metadata.postType]
    .some((value) => value !== undefined && (typeof value !== 'string' || !secondaryKinds.includes(value)))) {
    return unsupported();
  }
  return { supported: true, kind, appendixOnly: kind === 'trending_repository' };
}

const unsupported = (): ReaderValueSourceKindResult => ({ supported: false, reason: 'unsupported_kind' });
