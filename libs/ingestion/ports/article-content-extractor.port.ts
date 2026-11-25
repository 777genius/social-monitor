export type ArticleContentExtractionResult =
  | {
      readonly ok: true;
      readonly sourceUrl: string;
      readonly finalUrl: string;
      readonly title?: string;
      readonly text: string;
      readonly textLength: number;
      readonly originalTextLength?: number;
      readonly truncated?: boolean;
      readonly fullTextSha256?: string;
      readonly extractionVersion?: string;
      readonly wordCount: number;
      readonly contentHash: string;
      readonly semanticFingerprint: string;
    }
  | {
      readonly ok: false;
      readonly sourceUrl: string;
      readonly reason: string;
      readonly reasonCode?: string;
      readonly retryable?: boolean;
      readonly retryAfter?: string;
    };

export type ExtractArticleContentCommand = {
  readonly url: string;
  readonly correlationId: string;
  readonly signal?: AbortSignal;
  /** Remaining caller budget at dispatch; measured monotonically by the extractor. */
  readonly remainingBudgetMs?: number;
};

export interface ArticleContentExtractorPort {
  extract(command: ExtractArticleContentCommand): Promise<ArticleContentExtractionResult>;
}
