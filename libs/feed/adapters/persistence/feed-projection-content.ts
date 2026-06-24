import type { JsonObject, JsonValue } from '@social-monitor/shared-kernel';

const defaultPreviewCharacters = 280;
const enrichedArticleEvidenceCharacters = 4_000;

export const feedBodyPreviewForProjection = (input: {
  readonly body: string;
  readonly providerMetadata?: JsonObject;
}): string => {
  const limit = articleContentStatus(input.providerMetadata) === 'enriched'
    ? enrichedArticleEvidenceCharacters
    : defaultPreviewCharacters;

  return input.body.slice(0, limit);
};

const articleContentStatus = (metadata: JsonObject | undefined): string | undefined => {
  const articleContent = metadata?.articleContent;
  if (typeof articleContent !== 'object' || articleContent === null || Array.isArray(articleContent)) {
    return undefined;
  }

  const status: JsonValue | undefined = (articleContent as Readonly<Record<string, JsonValue>>).status;

  return typeof status === 'string' ? status : undefined;
};
