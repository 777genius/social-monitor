import type {
  YoutubeVideoSummaryProviderPort,
  YoutubeVideoSummaryRequest,
  YoutubeVideoSummaryResult,
} from '../../ports';
import { isYoutubeVideoUrl } from './youtube-url';

const promptVersion = 'youtube.video.summary.prompt.deterministic.v1';

export class DeterministicYoutubeVideoSummaryProvider implements YoutubeVideoSummaryProviderPort {
  readonly providerName = 'deterministic-local';

  supports(url: string): boolean {
    return isYoutubeVideoUrl(url);
  }

  async summarize(request: YoutubeVideoSummaryRequest): Promise<YoutubeVideoSummaryResult | null> {
    if (!this.supports(request.url)) {
      return null;
    }

    const context = request.bodyPreview?.trim();
    const summary = context === undefined || context.length === 0
      ? `Public YouTube video detected: ${request.title}.`
      : `Public YouTube video detected: ${request.title}. Existing preview: ${context}`;

    return {
      provider: this.providerName,
      model: 'deterministic-youtube-video-summary-v1',
      promptVersion,
      summary,
      keyPoints: [request.title],
      chapters: [],
      followUpQuestions: [
        'What changed compared with previous videos on this interest?',
        'Which claim needs source verification before sending an alert?',
      ],
      confidence: {
        level: 'low',
        score: 0.25,
        rationale: 'Deterministic local provider does not inspect the actual video.',
      },
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
      },
    };
  }
}
