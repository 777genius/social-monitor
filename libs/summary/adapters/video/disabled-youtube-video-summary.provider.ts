import type {
  YoutubeVideoSummaryProviderPort,
  YoutubeVideoSummaryRequest,
  YoutubeVideoSummaryResult,
} from '../../ports';

export class DisabledYoutubeVideoSummaryProvider implements YoutubeVideoSummaryProviderPort {
  readonly providerName = 'disabled';

  supports(): boolean {
    return false;
  }

  async summarize(
    request: YoutubeVideoSummaryRequest,
  ): Promise<YoutubeVideoSummaryResult | null> {
    void request;

    return null;
  }
}
