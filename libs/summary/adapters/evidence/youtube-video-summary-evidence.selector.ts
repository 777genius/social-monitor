import type {
  SummaryEvidenceExtractedSummary,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
  SummaryEvidenceSelectorPort,
  YoutubeVideoSummaryProviderPort,
  YoutubeVideoSummaryResult,
} from '../../ports';

export type YoutubeVideoSummaryEvidenceSelectorOptions = {
  readonly maxVideosPerSelection: number;
  readonly maxPreviewCharacters: number;
  readonly continueOnProviderError: boolean;
};

const defaultOptions: YoutubeVideoSummaryEvidenceSelectorOptions = {
  maxVideosPerSelection: 3,
  maxPreviewCharacters: 4_000,
  continueOnProviderError: true,
};

export class YoutubeVideoSummaryEvidenceSelector implements SummaryEvidenceSelectorPort {
  constructor(
    private readonly delegate: SummaryEvidenceSelectorPort,
    private readonly provider: YoutubeVideoSummaryProviderPort,
    private readonly options: Partial<YoutubeVideoSummaryEvidenceSelectorOptions> = {},
  ) {}

  async select(
    params: Parameters<SummaryEvidenceSelectorPort['select']>[0],
  ): Promise<SummaryEvidenceSelection> {
    const selection = await this.delegate.select(params);
    const options = { ...defaultOptions, ...this.options };
    const maxVideos = normalizePositiveInteger(options.maxVideosPerSelection, defaultOptions.maxVideosPerSelection);
    const maxPreviewCharacters = normalizePositiveInteger(
      options.maxPreviewCharacters,
      defaultOptions.maxPreviewCharacters,
    );
    let enrichedCount = 0;
    const items: SummaryEvidenceItem[] = [];

    for (const item of selection.items) {
      if (enrichedCount >= maxVideos || item.canonicalUrl === undefined || !this.provider.supports(item.canonicalUrl)) {
        items.push(item);
        continue;
      }

      try {
        const summary = await this.provider.summarize({
          tenantId: params.tenantId,
          workspaceId: params.workspaceId,
          topicId: params.topicId,
          feedItemId: item.feedItemId,
          sourceItemId: item.sourceItemId,
          sourceBindingId: item.sourceBindingId,
          url: item.canonicalUrl,
          title: item.title,
          bodyPreview: item.bodyPreview,
          observedAt: item.observedAt,
        });

        if (summary === null) {
          items.push(item);
          continue;
        }

        enrichedCount += 1;
        items.push(enrichItem(item, summary, maxPreviewCharacters));
      } catch (error) {
        if (!options.continueOnProviderError) {
          throw error;
        }

        items.push(item);
      }
    }

    return {
      ...selection,
      items,
    };
  }
}

const enrichItem = (
  item: SummaryEvidenceItem,
  summary: YoutubeVideoSummaryResult,
  maxPreviewCharacters: number,
): SummaryEvidenceItem => ({
  ...item,
  bodyPreview: limitPreview(
    [item.bodyPreview, formatVideoSummaryPreview(summary)].filter(hasContent).join('\n\n'),
    maxPreviewCharacters,
  ),
  extractedSummaries: [
    ...(item.extractedSummaries ?? []),
    toExtractedSummary(summary),
  ],
});

const toExtractedSummary = (summary: YoutubeVideoSummaryResult): SummaryEvidenceExtractedSummary => ({
  kind: 'youtube_video_summary',
  provider: summary.provider,
  model: summary.model,
  promptVersion: summary.promptVersion,
  summary: summary.summary,
  keyPoints: summary.keyPoints,
  chapters: summary.chapters,
  followUpQuestions: summary.followUpQuestions,
  confidenceScore: summary.confidence.score,
});

const formatVideoSummaryPreview = (summary: YoutubeVideoSummaryResult): string => {
  const keyPoints = summary.keyPoints.length === 0 ? '' : `\nKey points: ${summary.keyPoints.join('; ')}`;
  const chapters = summary.chapters.length === 0
    ? ''
    : `\nChapters: ${summary.chapters.map((chapter) => `${chapter.startTime ?? '??:??'} ${chapter.title}`).join('; ')}`;
  const followUps = summary.followUpQuestions.length === 0
    ? ''
    : `\nFollow-up questions: ${summary.followUpQuestions.join('; ')}`;

  return `YouTube video summary (${summary.provider}/${summary.model}): ${summary.summary}${keyPoints}${chapters}${followUps}`;
};

const limitPreview = (value: string, maxCharacters: number): string => {
  if (value.length <= maxCharacters) {
    return value;
  }

  return value.slice(0, Math.max(0, maxCharacters - 3)).trimEnd() + '...';
};

const hasContent = (value: string | undefined): value is string =>
  value !== undefined && value.trim().length > 0;

const normalizePositiveInteger = (value: number, fallback: number): number =>
  Number.isInteger(value) && value > 0 ? value : fallback;
