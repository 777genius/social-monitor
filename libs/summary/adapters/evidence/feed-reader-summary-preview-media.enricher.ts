import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";

import type {
  PreviewMedia,
  ReaderSummaryArtifact,
  ReaderSummaryCitation,
  ReaderSummaryContent,
  TopRead,
} from "../../domain";
import type { ReaderSummaryPreviewMediaEnricherPort } from "../../ports";
import { previewMediaFromProviderMetadata } from "./provider-preview-media";

export class FeedReaderSummaryPreviewMediaEnricher
  implements ReaderSummaryPreviewMediaEnricherPort
{
  constructor(private readonly feedItems: FeedItemReadRepositoryPort) {}

  async enrich(command: {
    readonly artifact: ReaderSummaryArtifact;
    readonly content: ReaderSummaryContent;
  }): Promise<ReaderSummaryContent> {
    const missingPreview = [
      ...command.content.topReads,
      ...command.content.interestSections.flatMap((section) => section.items),
    ].some((item) => item.previewMedia === undefined);
    if (!missingPreview) {
      return command.content;
    }

    const snapshot = command.artifact.toSnapshot();
    const citationsById = new Map(
      snapshot.citationMap.map((citation) => [citation.citationId, citation]),
    );
    const feedItemCache = new Map<string, Promise<PreviewMedia | undefined>>();
    const enrichTopRead = async (item: TopRead): Promise<TopRead> => {
      if (item.previewMedia !== undefined) {
        return item;
      }
      const previewMedia = await this.previewMediaForTopRead({
        item,
        artifact: snapshot,
        citationsById,
        feedItemCache,
      });
      return previewMedia === undefined ? item : { ...item, previewMedia };
    };

    const topReads = await Promise.all(
      command.content.topReads.map(enrichTopRead),
    );
    const interestSections = await Promise.all(
      command.content.interestSections.map(async (section) => ({
        ...section,
        items: await Promise.all(section.items.map(enrichTopRead)),
      })),
    );

    return {
      ...command.content,
      topReads,
      interestSections,
    };
  }

  private async previewMediaForTopRead(params: {
    readonly item: TopRead;
    readonly artifact: ReturnType<ReaderSummaryArtifact["toSnapshot"]>;
    readonly citationsById: ReadonlyMap<string, ReaderSummaryCitation>;
    readonly feedItemCache: Map<string, Promise<PreviewMedia | undefined>>;
  }): Promise<PreviewMedia | undefined> {
    for (const citationId of params.item.citationIds) {
      const citation = params.citationsById.get(citationId);
      if (citation === undefined) {
        continue;
      }

      const cacheKey = [
        params.artifact.tenantId,
        params.artifact.workspaceId,
        citation.feedItemId,
      ].join(":");
      const cached =
        params.feedItemCache.get(cacheKey) ??
        this.previewMediaForCitation(params.artifact, citation, params.item);
      params.feedItemCache.set(cacheKey, cached);

      const previewMedia = await cached;
      if (previewMedia !== undefined) {
        return previewMedia;
      }
    }

    return undefined;
  }

  private async previewMediaForCitation(
    artifact: ReturnType<ReaderSummaryArtifact["toSnapshot"]>,
    citation: ReaderSummaryCitation,
    item: TopRead,
  ): Promise<PreviewMedia | undefined> {
    const feedItem = await this.feedItems.findById({
      tenantId: artifact.tenantId,
      workspaceId: artifact.workspaceId,
      feedItemId: citation.feedItemId,
    });
    if (feedItem === null) {
      return undefined;
    }

    const snapshot = feedItem.toSnapshot();
    return previewMediaFromProviderMetadata({
      providerKey: snapshot.providerKey,
      providerMetadata: snapshot.providerMetadata,
      title: snapshot.title.trim().length > 0 ? snapshot.title : item.title,
      canonicalUrl:
        snapshot.canonicalUrl.trim().length > 0
          ? snapshot.canonicalUrl
          : citation.canonicalUrl ?? item.canonicalUrl,
    });
  }
}
