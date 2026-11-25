export type FeedSignalBand = 'no_signal' | 'low' | 'normal' | 'high' | 'breakout';

export type FeedSignalCohort = {
  readonly providerKey: string;
  readonly sourceKey: string;
  readonly contentType: string;
  readonly ageBucket: string;
  readonly baselineWindow: '24h' | '7d' | '30d' | 'all';
  readonly sampleSize: number;
  readonly percentile: number;
  readonly zScore: number;
  readonly fallback: 'exact' | 'source' | 'provider_age' | 'provider';
};

export type FeedNormalizedSignal = {
  readonly score: number;
  readonly band: FeedSignalBand;
  readonly confidence: number;
  readonly basis: 'cohort_baseline_v1';
  readonly computedAt: string;
  readonly cohort: FeedSignalCohort;
};
