import type { SourceTargetKind } from './entities/source-target';

export type SourceTargetPresetEntry = {
  readonly providerKey: string;
  readonly targetKind: SourceTargetKind;
  readonly targetValue: string;
  readonly targetConfig: Readonly<Record<string, unknown>>;
};

export type SourceTargetPresetSummaryPreference = {
  readonly language: 'auto' | 'en' | 'ru';
  readonly format: 'executive_brief' | 'bullet_digest' | 'risk_brief';
  readonly tone: 'neutral' | 'concise' | 'analytical';
  readonly maxKeyPoints: number;
  readonly includeRisks: boolean;
  readonly includeSourceHighlights: boolean;
  readonly customInstructions: string;
};

export type SourceTargetPreset = {
  readonly presetId: string;
  readonly displayName: string;
  readonly description: string;
  readonly defaultIntervalSeconds: number;
  readonly summaryPreference: SourceTargetPresetSummaryPreference;
  readonly entries: readonly SourceTargetPresetEntry[];
};

const redditTopWeekConfig = {
  listing: 'top',
  topTime: 'week',
  maxItems: 10,
  minScore: 10,
} as const;

const hnSearchConfig = {
  maxItems: 10,
} as const;

const rssConfig = {
  maxItems: 15,
} as const;

export const aiDeveloperSignalSourcePreset = {
  presetId: 'ai-developer-signal-v1',
  displayName: 'AI developer signal',
  description: 'High-signal AI, agent tooling, Flutter/Dart, JS/Node, Python, webdev and security sources.',
  defaultIntervalSeconds: 28_800,
  summaryPreference: {
    language: 'auto',
    format: 'bullet_digest',
    tone: 'analytical',
    maxKeyPoints: 8,
    includeRisks: true,
    includeSourceHighlights: true,
    customInstructions:
      'Prioritize concrete product, library, release, security and developer-workflow signals. Prefer highly engaged source items and explain why each source matters.',
  },
  entries: [
    ...[
      'ArtificialInteligence',
      'ClaudeAI',
      'ClaudeCode',
      'codex',
      'cybersecurity',
      'dartlang',
      'FlutterDev',
      'javascript',
      'node',
      'OpenAI',
      'Python',
      'webdev',
    ].map((subreddit): SourceTargetPresetEntry => ({
      providerKey: 'reddit',
      targetKind: 'subreddit',
      targetValue: subreddit,
      targetConfig: redditTopWeekConfig,
    })),
    ...[
      'openai',
      'claude',
      'ai coding agents',
      'flutter dart',
      'javascript node',
      'python developer tools',
      'cybersecurity',
    ].map((query): SourceTargetPresetEntry => ({
      providerKey: 'hacker-news',
      targetKind: 'search_query',
      targetValue: query,
      targetConfig: hnSearchConfig,
    })),
    ...[
      'https://hnrss.org/best',
      'https://hnrss.org/frontpage',
      'https://hnrss.org/newest?q=AI',
      'https://hnrss.org/newest?q=Flutter',
      'https://hnrss.org/newest?q=cybersecurity',
    ].map((url): SourceTargetPresetEntry => ({
      providerKey: 'rss',
      targetKind: 'url',
      targetValue: url,
      targetConfig: rssConfig,
    })),
  ],
} satisfies SourceTargetPreset;
