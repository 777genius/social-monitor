import type {
  YoutubeVideoSummaryChapter,
  YoutubeVideoSummaryProviderPort,
  YoutubeVideoSummaryRequest,
  YoutubeVideoSummaryResult,
} from '../../ports';
import type { SummaryConfidence } from '../../domain';
import { isYoutubeVideoUrl } from './youtube-url';

type GeminiFetch = (
  url: string,
  init: {
    readonly method: 'POST';
    readonly headers: Readonly<Record<string, string>>;
    readonly body: string;
    readonly signal?: AbortSignal;
  },
) => Promise<GeminiFetchResponse>;

type GeminiFetchResponse = {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
};

export type GoogleGeminiYoutubeVideoSummaryProviderOptions = {
  readonly apiKey: string;
  readonly model: string;
  readonly promptVersion?: string;
  readonly endpointBaseUrl?: string;
  readonly estimatedInputCostUsdPerMillionTokens?: number;
  readonly estimatedOutputCostUsdPerMillionTokens?: number;
  readonly timeoutMs?: number;
  readonly fetch?: GeminiFetch;
};

type GeminiGenerateContentResponse = {
  readonly candidates?: readonly {
    readonly content?: {
      readonly parts?: readonly {
        readonly text?: string;
      }[];
    };
  }[];
  readonly usageMetadata?: {
    readonly promptTokenCount?: number;
    readonly candidatesTokenCount?: number;
    readonly totalTokenCount?: number;
  };
};

type GeminiVideoSummaryJson = {
  readonly summary?: unknown;
  readonly key_points?: unknown;
  readonly chapters?: unknown;
  readonly follow_up_questions?: unknown;
  readonly confidence?: unknown;
};

export class GoogleGeminiYoutubeVideoSummaryProvider implements YoutubeVideoSummaryProviderPort {
  readonly providerName = 'google-gemini';

  private readonly apiKey: string;
  private readonly model: string;
  private readonly promptVersion: string;
  private readonly endpointBaseUrl: string;
  private readonly estimatedInputCostUsdPerMillionTokens: number;
  private readonly estimatedOutputCostUsdPerMillionTokens: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: GeminiFetch;

  constructor(options: GoogleGeminiYoutubeVideoSummaryProviderOptions) {
    this.apiKey = requireNonEmpty(options.apiKey, 'GEMINI_API_KEY');
    this.model = requireNonEmpty(options.model, 'Gemini model');
    this.promptVersion = options.promptVersion ?? 'youtube.video.summary.gemini.v1';
    this.endpointBaseUrl = options.endpointBaseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    this.estimatedInputCostUsdPerMillionTokens = options.estimatedInputCostUsdPerMillionTokens ?? 0;
    this.estimatedOutputCostUsdPerMillionTokens = options.estimatedOutputCostUsdPerMillionTokens ?? 0;
    this.timeoutMs = readBoundedTimeoutMs(options.timeoutMs);
    this.fetchImpl = options.fetch ?? defaultFetch;
  }

  supports(url: string): boolean {
    return isYoutubeVideoUrl(url);
  }

  async summarize(request: YoutubeVideoSummaryRequest): Promise<YoutubeVideoSummaryResult | null> {
    if (!this.supports(request.url)) {
      return null;
    }

    const response = await this.fetchImpl(this.endpointUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                file_data: {
                  file_uri: request.url,
                },
              },
              {
                text: buildPrompt(request),
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Gemini YouTube summary request failed with status ${response.status}: ${await response.text()}`);
    }

    const payload = await response.json();
    const geminiResponse = payload as GeminiGenerateContentResponse;
    const text = extractText(geminiResponse);
    const parsed = parseSummaryJson(text);
    const usage = buildUsage(geminiResponse, {
      inputCost: this.estimatedInputCostUsdPerMillionTokens,
      outputCost: this.estimatedOutputCostUsdPerMillionTokens,
    });

    return {
      provider: this.providerName,
      model: this.model,
      promptVersion: this.promptVersion,
      summary: requireString(parsed.summary, 'summary'),
      keyPoints: readStringArray(parsed.key_points),
      chapters: readChapters(parsed.chapters),
      followUpQuestions: readStringArray(parsed.follow_up_questions),
      confidence: readConfidence(parsed.confidence),
      usage,
    };
  }

  private endpointUrl(): string {
    return `${this.endpointBaseUrl}/${normalizeModelPath(this.model)}:generateContent`;
  }
}

const buildPrompt = (request: YoutubeVideoSummaryRequest): string => `Summarize this public YouTube video for a monitoring product.
Return strict JSON only with this shape:
{
  "summary": "2-5 sentence factual summary",
  "key_points": ["short factual point"],
  "chapters": [{"start_time": "MM:SS", "title": "short title", "summary": "what happens"}],
  "follow_up_questions": ["useful analyst question"],
  "confidence": {"score": 0.0, "level": "low|medium|high", "rationale": "short reason"}
}

Interest id: ${request.interestId}
Feed title: ${request.title}
Existing preview: ${request.bodyPreview ?? 'none'}
Do not invent facts that are not supported by the video.`;

const defaultFetch: GeminiFetch = async (url, init) => {
  const response = await fetch(url, init);

  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json() as Promise<unknown>,
    text: () => response.text(),
  };
};

const extractText = (response: GeminiGenerateContentResponse): string => {
  const text = response.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();

  if (text === undefined || text.length === 0) {
    throw new Error('Gemini YouTube summary response did not include text');
  }

  return text;
};

const parseSummaryJson = (text: string): GeminiVideoSummaryJson => {
  const normalized = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = normalized.indexOf('{');
  const end = normalized.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Gemini YouTube summary response was not JSON');
  }

  const parsed = JSON.parse(normalized.slice(start, end + 1)) as unknown;

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Gemini YouTube summary JSON must be an object');
  }

  return parsed as GeminiVideoSummaryJson;
};

const buildUsage = (
  response: GeminiGenerateContentResponse,
  costs: { readonly inputCost: number; readonly outputCost: number },
) => {
  const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
  const estimatedCostUsd =
    (inputTokens / 1_000_000) * costs.inputCost +
    (outputTokens / 1_000_000) * costs.outputCost;

  return {
    inputTokens,
    outputTokens,
    estimatedCostUsd,
  };
};

const requireString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Gemini YouTube summary JSON field must be a non-empty string: ${field}`);
  }

  return value.trim();
};

const readBoundedTimeoutMs = (value: number | undefined): number => {
  const timeoutMs = value ?? 30_000;

  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new Error('Gemini YouTube summary timeout must be between 1000 and 120000 ms');
  }

  return timeoutMs;
};

const readStringArray = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
};

const readChapters = (value: unknown): readonly YoutubeVideoSummaryChapter[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item): YoutubeVideoSummaryChapter[] => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const summary = typeof record.summary === 'string' ? record.summary.trim() : '';

    if (title.length === 0 || summary.length === 0) {
      return [];
    }

    const startTime = typeof record.start_time === 'string' && record.start_time.trim().length > 0
      ? record.start_time.trim()
      : undefined;

    return [{ startTime, title, summary }];
  });
};

const readConfidence = (value: unknown): SummaryConfidence => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      level: 'medium' as const,
      score: 0.5,
      rationale: 'Gemini did not return structured confidence.',
    };
  }

  const record = value as Record<string, unknown>;
  const score = typeof record.score === 'number' && Number.isFinite(record.score)
    ? Math.max(0, Math.min(1, record.score))
    : 0.5;
  const level = record.level === 'high' || record.level === 'medium' || record.level === 'low'
    ? record.level
    : score >= 0.75
      ? 'high'
      : score >= 0.45
        ? 'medium'
        : 'low';
  const rationale = typeof record.rationale === 'string' && record.rationale.trim().length > 0
    ? record.rationale.trim()
    : 'Confidence returned by Gemini YouTube summary provider.';

  return { level, score, rationale };
};

const requireNonEmpty = (value: string, label: string): string => {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error(`${label} must be non-empty`);
  }

  return trimmed;
};

const normalizeModelPath = (model: string): string => {
  const normalized = model.startsWith('models/') ? model : `models/${model}`;

  return normalized
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
};
