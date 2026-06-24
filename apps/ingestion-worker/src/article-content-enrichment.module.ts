import type { Provider } from '@nestjs/common';
import { ArticleContentSourceItemEnrichmentAdapter } from '@social-monitor/ingestion/adapters/enrichment/article-content-source-item-enrichment.adapter';
import { HttpReadabilityArticleContentExtractor } from '@social-monitor/ingestion/adapters/enrichment/http-readability-article-content-extractor';
import type { SourceItemEnrichmentPort } from '@social-monitor/ingestion/ports';

export { ArticleContentSourceItemEnrichmentAdapter };

export const articleContentEnrichmentProviders: Provider[] = [
  {
    provide: ArticleContentSourceItemEnrichmentAdapter,
    useFactory: (): SourceItemEnrichmentPort =>
      new ArticleContentSourceItemEnrichmentAdapter(new HttpReadabilityArticleContentExtractor()),
  },
];
