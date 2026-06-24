export type ArticleContentExtractionResult =
  | {
      readonly ok: true;
      readonly sourceUrl: string;
      readonly finalUrl: string;
      readonly title?: string;
      readonly text: string;
      readonly textLength: number;
      readonly wordCount: number;
      readonly contentHash: string;
      readonly semanticFingerprint: string;
    }
  | {
      readonly ok: false;
      readonly sourceUrl: string;
      readonly reason: string;
    };

export type ExtractArticleContentCommand = {
  readonly url: string;
  readonly correlationId: string;
};

export interface ArticleContentExtractorPort {
  extract(command: ExtractArticleContentCommand): Promise<ArticleContentExtractionResult>;
}
