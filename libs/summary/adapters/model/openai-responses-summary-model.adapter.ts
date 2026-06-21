import type {
  SummaryCitation,
  SummaryConfidence,
  SummaryKeyPoint,
  SummaryQualityFlag,
  SummaryRisk,
} from '../../domain';
import type {
  GeneratedSummaryDraft,
  ProviderSummaryAttempt,
  SummaryModelBudget,
  SummaryModelEstimate,
  SummaryModelFailure,
  SummaryModelInput,
  SummaryModelPolicy,
  SummaryModelPort,
  SummaryModelRoute,
  SummaryModelValidationResult,
} from '../../ports';

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type OpenAiResponsesSummaryModelAdapterOptions = {
  readonly apiKey?: string;
  readonly endpointUrl?: string;
  readonly model?: string;
  readonly promptVersion?: string;
  readonly evalDatasetVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly inputTokenDivisor?: number;
  readonly estimatedInputCostUsdPerMillionTokens?: number;
  readonly estimatedOutputCostUsdPerMillionTokens?: number;
  readonly fetchFn?: FetchLike;
};

const provider = 'openai-responses';
const defaultModel = 'gpt-5.1-mini';
const defaultPromptVersion = 'summary.prompt.openai.responses.v1';
const defaultEvalDatasetVersion = 'summary.eval.mvp.v1';
const defaultEndpointUrl = 'https://api.openai.com/v1/responses';
const defaultTimeoutMs = 60_000;
const defaultMaxOutputTokens = 1_500;
const defaultInputTokenDivisor = 4;

const qualityFlags = new Set<SummaryQualityFlag>([
  'no_signal',
  'low_confidence',
  'conflicting_evidence',
  'limited_sources',
]);
const confidenceLevels = new Set<SummaryConfidence['level']>(['none', 'low', 'medium', 'high']);
const citationFields = new Set<SummaryCitation['field']>(['title', 'bodyPreview', 'canonicalUrl']);
const riskReasons = new Set<NonNullable<SummaryRisk['reason']>>([
  'insufficient_evidence',
  'conflicting_evidence',
  'source_limit',
]);

export class OpenAiResponsesSummaryModelAdapter implements SummaryModelPort {
  private readonly apiKey: string;
  private readonly endpointUrl: string;
  private readonly model: string;
  private readonly promptVersion: string;
  private readonly evalDatasetVersion: string;
  private readonly timeoutMs: number;
  private readonly maxOutputTokens: number;
  private readonly inputTokenDivisor: number;
  private readonly estimatedInputCostUsdPerMillionTokens: number;
  private readonly estimatedOutputCostUsdPerMillionTokens: number;
  private readonly fetchFn: FetchLike;

  constructor(options: OpenAiResponsesSummaryModelAdapterOptions = {}) {
    this.apiKey = options.apiKey?.trim() ?? '';
    this.endpointUrl = nonEmptyOrFallback(options.endpointUrl, defaultEndpointUrl);
    this.model = nonEmptyOrFallback(options.model, defaultModel);
    this.promptVersion = nonEmptyOrFallback(options.promptVersion, defaultPromptVersion);
    this.evalDatasetVersion = nonEmptyOrFallback(options.evalDatasetVersion, defaultEvalDatasetVersion);
    this.timeoutMs = positiveIntegerOrFallback(options.timeoutMs, defaultTimeoutMs);
    this.maxOutputTokens = positiveIntegerOrFallback(options.maxOutputTokens, defaultMaxOutputTokens);
    this.inputTokenDivisor = positiveIntegerOrFallback(options.inputTokenDivisor, defaultInputTokenDivisor);
    this.estimatedInputCostUsdPerMillionTokens = nonNegativeNumberOrFallback(
      options.estimatedInputCostUsdPerMillionTokens,
      0,
    );
    this.estimatedOutputCostUsdPerMillionTokens = nonNegativeNumberOrFallback(
      options.estimatedOutputCostUsdPerMillionTokens,
      0,
    );
    this.fetchFn = options.fetchFn ?? fetch;
  }

  route(input: SummaryModelInput, policy: SummaryModelPolicy, budget: SummaryModelBudget): SummaryModelRoute {
    const route = this.buildRoute();
    const estimate = this.estimate(input, route);

    if (
      estimate.inputTokens > policy.maxInputTokens ||
      estimate.outputTokens > policy.maxOutputTokens ||
      estimate.estimatedCostUsd > policy.maxEstimatedCostUsd ||
      estimate.inputTokens + estimate.outputTokens > budget.remainingTokens ||
      estimate.estimatedCostUsd > budget.remainingCostUsd
    ) {
      throw new SummaryModelProviderError({
        kind: 'budget_exceeded',
        retryable: false,
        message: 'Summary model budget exceeded',
      });
    }

    return route;
  }

  estimate(input: SummaryModelInput, selectedRoute: SummaryModelRoute): SummaryModelEstimate {
    void selectedRoute;

    const inputTokens = Math.ceil(buildPromptPayload(input).length / this.inputTokenDivisor);
    const outputTokens = input.evidence.items.length === 0
      ? 96
      : Math.min(this.maxOutputTokens, Math.max(256, input.policy.maxKeyPoints * 220));
    const estimatedCostUsd =
      (inputTokens * this.estimatedInputCostUsdPerMillionTokens +
        outputTokens * this.estimatedOutputCostUsdPerMillionTokens) /
      1_000_000;

    return {
      inputTokens,
      outputTokens,
      estimatedCostUsd,
    };
  }

  async summarize(input: SummaryModelInput, selectedRoute: SummaryModelRoute): Promise<ProviderSummaryAttempt> {
    if (input.evidence.items.length === 0) {
      return this.buildNoSignalAttempt(input, selectedRoute);
    }

    if (this.apiKey.length === 0) {
      throw new SummaryModelProviderError({
        kind: 'provider_unavailable',
        retryable: false,
        message: 'SUMMARY_MODEL_PROVIDER=openai-responses requires OPENAI_API_KEY',
      });
    }

    const request = {
      model: selectedRoute.model,
      store: false,
      max_output_tokens: this.maxOutputTokens,
      instructions: buildInstructions(input),
      input: buildPromptPayload(input),
      text: {
        format: {
          type: 'json_schema',
          name: 'social_monitor_summary_artifact',
          strict: true,
          schema: openAiSummaryJsonSchema,
        },
      },
    };

    const responseJson = await this.createResponse(request);
    const outputText = extractOutputText(responseJson);

    if (outputText === undefined) {
      throw new SummaryModelProviderError({
        kind: 'unsafe_or_refused',
        retryable: false,
        message: 'OpenAI response did not contain summary output text',
      });
    }

    const rawDraft = parseJsonObject(outputText);
    const usage = resolveUsage(responseJson, this.estimate(input, selectedRoute));
    const draft = normalizeOpenAiDraft(rawDraft, input, selectedRoute, usage, this.evalDatasetVersion);

    return {
      route: selectedRoute,
      draft,
    };
  }

  validateRawProviderResponse(attempt: ProviderSummaryAttempt): SummaryModelValidationResult {
    try {
      assertDraftShape(attempt.draft);

      if (attempt.route.schemaVersion !== 'summary.artifact.v1') {
        throw new Error('Unsupported summary schema version');
      }

      if (attempt.route.provider !== provider) {
        throw new Error('Unexpected summary provider route');
      }

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        failure: {
          kind: 'invalid_schema',
          retryable: false,
          message: error instanceof Error ? error.message : 'Invalid summary provider response',
        },
      };
    }
  }

  classifyError(error: unknown): SummaryModelFailure {
    if (error instanceof SummaryModelProviderError) {
      return error.failure;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      return {
        kind: 'provider_unavailable',
        retryable: true,
        message: 'OpenAI summary request timed out',
      };
    }

    const message = error instanceof Error ? error.message : 'Unknown summary model error';
    const lower = message.toLowerCase();

    if (lower.includes('budget')) {
      return {
        kind: 'budget_exceeded',
        retryable: false,
        message,
      };
    }

    if (lower.includes('citation')) {
      return {
        kind: 'citation_validation_failed',
        retryable: false,
        message,
      };
    }

    if (lower.includes('schema') || lower.includes('json')) {
      return {
        kind: 'invalid_schema',
        retryable: false,
        message,
      };
    }

    return {
      kind: 'unknown',
      retryable: false,
      message,
    };
  }

  private buildRoute(): SummaryModelRoute {
    return {
      provider,
      model: this.model,
      promptVersion: this.promptVersion,
      schemaVersion: 'summary.artifact.v1',
    };
  }

  private buildNoSignalAttempt(input: SummaryModelInput, selectedRoute: SummaryModelRoute): ProviderSummaryAttempt {
    return {
      route: selectedRoute,
      draft: {
        headline: 'No reliable signal yet',
        executiveSummary: 'No eligible evidence items were available for this topic window.',
        keyPoints: [],
        risksAndUnknowns: [
          {
            description: 'The summary window did not contain enough source material to produce claims.',
            reason: 'insufficient_evidence',
          },
        ],
        sourceHighlights: [],
        citationMap: [],
        qualityFlags: ['no_signal', 'limited_sources'],
        confidence: {
          level: 'none',
          score: 0,
          rationale: 'No evidence was selected for the summary window.',
        },
        lineage: buildLineage(input, selectedRoute, this.evalDatasetVersion),
        usage: this.estimate(input, selectedRoute),
        noSignalReason: 'No eligible evidence items selected for this topic.',
      },
    };
  }

  private async createResponse(request: Record<string, unknown>): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(this.endpointUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const body = await readResponseBody(response);

      if (!response.ok) {
        throw new SummaryModelProviderError(classifyOpenAiHttpFailure(response.status, body));
      }

      const record = asRecord(body);

      if (record === null) {
        throw new SummaryModelProviderError({
          kind: 'invalid_schema',
          retryable: false,
          message: 'OpenAI response body must be a JSON object',
        });
      }

      return record;
    } catch (error) {
      if (error instanceof SummaryModelProviderError || (error instanceof Error && error.name === 'AbortError')) {
        throw error;
      }

      throw new SummaryModelProviderError({
        kind: 'provider_unavailable',
        retryable: true,
        message: error instanceof Error ? error.message : 'OpenAI summary request failed',
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const resolveOpenAiResponsesSummaryModelOptions = (
  env: NodeJS.ProcessEnv,
  params: { readonly requireApiKey: boolean },
): OpenAiResponsesSummaryModelAdapterOptions => {
  const apiKey = env.OPENAI_API_KEY?.trim() ?? '';

  if (params.requireApiKey && apiKey.length === 0) {
    throw new Error('SUMMARY_MODEL_PROVIDER=openai-responses requires OPENAI_API_KEY');
  }

  return {
    apiKey,
    endpointUrl: env.OPENAI_RESPONSES_ENDPOINT_URL,
    model: env.OPENAI_SUMMARY_MODEL,
    promptVersion: env.OPENAI_SUMMARY_PROMPT_VERSION,
    evalDatasetVersion: env.SUMMARY_EVAL_DATASET_VERSION,
    timeoutMs: parsePositiveInteger(env.OPENAI_SUMMARY_TIMEOUT_MS),
    maxOutputTokens: parsePositiveInteger(env.OPENAI_SUMMARY_MAX_OUTPUT_TOKENS),
    estimatedInputCostUsdPerMillionTokens: parseNonNegativeNumber(env.OPENAI_SUMMARY_INPUT_COST_USD_PER_MILLION_TOKENS),
    estimatedOutputCostUsdPerMillionTokens: parseNonNegativeNumber(
      env.OPENAI_SUMMARY_OUTPUT_COST_USD_PER_MILLION_TOKENS,
    ),
  };
};

class SummaryModelProviderError extends Error {
  constructor(readonly failure: SummaryModelFailure) {
    super(failure.message);
  }
}

const buildInstructions = (input: SummaryModelInput): string => [
  'You are the production summary model for Social Monitor.',
  'Return only JSON that matches the provided schema.',
  'Use only the provided evidence items. Do not invent facts.',
  'Every key point must cite one or more citation IDs from citationMap.',
  'Prefer concise, high-signal output over broad coverage.',
  `Language policy: ${input.policy.language}. Format: ${input.policy.format}. Tone: ${input.policy.tone}.`,
  `Include risks: ${input.policy.includeRisks ? 'yes' : 'no'}. Include source highlights: ${
    input.policy.includeSourceHighlights ? 'yes' : 'no'
  }.`,
  input.policy.customInstructions === undefined ? '' : `User custom focus: ${input.policy.customInstructions}`,
].filter((line) => line.length > 0).join('\n');

const buildPromptPayload = (input: SummaryModelInput): string => JSON.stringify({
  topicId: input.topicId,
  requestedAt: input.requestedAt.toISOString(),
  policy: input.policy,
  sourceWindow: {
    windowId: input.evidence.sourceWindow.windowId,
    startedAt: input.evidence.sourceWindow.startedAt.toISOString(),
    endedAt: input.evidence.sourceWindow.endedAt.toISOString(),
  },
  evidence: input.evidence.items.map((item, index) => ({
    index: index + 1,
    citationId: `c${index + 1}`,
    feedItemId: item.feedItemId,
    sourceItemId: item.sourceItemId,
    sourceBindingId: item.sourceBindingId,
    title: item.title,
    bodyPreview: item.bodyPreview,
    canonicalUrl: item.canonicalUrl,
    observedAt: item.observedAt.toISOString(),
    extractedSummaries: item.extractedSummaries,
  })),
});

const buildLineage = (
  input: SummaryModelInput,
  selectedRoute: SummaryModelRoute,
  evalDatasetVersion: string,
) => ({
  promptVersion: selectedRoute.promptVersion,
  schemaVersion: selectedRoute.schemaVersion,
  modelVersion: selectedRoute.model,
  providerVersion: selectedRoute.provider,
  rulesVersion: input.policy.rulesVersion,
  evalDatasetVersion,
} as const);

const normalizeOpenAiDraft = (
  raw: Record<string, unknown>,
  input: SummaryModelInput,
  selectedRoute: SummaryModelRoute,
  usage: SummaryModelEstimate,
  evalDatasetVersion: string,
): GeneratedSummaryDraft => {
  const draft = {
    headline: requiredString(raw.headline, 'headline'),
    executiveSummary: requiredString(raw.executiveSummary, 'executiveSummary'),
    keyPoints: normalizeKeyPoints(raw.keyPoints),
    risksAndUnknowns: normalizeRisks(raw.risksAndUnknowns),
    sourceHighlights: normalizeStringArray(raw.sourceHighlights, 'sourceHighlights'),
    citationMap: normalizeCitationMap(raw.citationMap),
    qualityFlags: normalizeQualityFlags(raw.qualityFlags),
    confidence: normalizeConfidence(raw.confidence),
    lineage: buildLineage(input, selectedRoute, evalDatasetVersion),
    usage,
    noSignalReason: optionalString(raw.noSignalReason),
  };

  assertDraftShape(draft);

  return draft;
};

const normalizeKeyPoints = (value: unknown): readonly SummaryKeyPoint[] => {
  const values = requiredArray(value, 'keyPoints');

  return values.map((item, index) => {
    const record = requiredRecord(item, `keyPoints[${index}]`);

    return {
      claim: requiredString(record.claim, `keyPoints[${index}].claim`),
      citationIds: normalizeStringArray(record.citationIds, `keyPoints[${index}].citationIds`),
    };
  });
};

const normalizeRisks = (value: unknown): readonly SummaryRisk[] => {
  const values = requiredArray(value, 'risksAndUnknowns');

  return values.map((item, index) => {
    const record = requiredRecord(item, `risksAndUnknowns[${index}]`);
    const reason = optionalString(record.reason);

    if (reason !== undefined && !riskReasons.has(reason as NonNullable<SummaryRisk['reason']>)) {
      throw new Error(`Invalid summary risk reason at risksAndUnknowns[${index}].reason`);
    }

    return {
      description: requiredString(record.description, `risksAndUnknowns[${index}].description`),
      citationIds: record.citationIds === null ? undefined : normalizeOptionalStringArray(record.citationIds),
      reason: reason as SummaryRisk['reason'],
    };
  });
};

const normalizeCitationMap = (value: unknown): readonly SummaryCitation[] => {
  const values = requiredArray(value, 'citationMap');

  return values.map((item, index) => {
    const record = requiredRecord(item, `citationMap[${index}]`);
    const field = requiredString(record.field, `citationMap[${index}].field`);

    if (!citationFields.has(field as SummaryCitation['field'])) {
      throw new Error(`Invalid citation field at citationMap[${index}].field`);
    }

    return {
      citationId: requiredString(record.citationId, `citationMap[${index}].citationId`),
      feedItemId: requiredString(record.feedItemId, `citationMap[${index}].feedItemId`),
      sourceItemId: requiredString(record.sourceItemId, `citationMap[${index}].sourceItemId`),
      field: field as SummaryCitation['field'],
    };
  });
};

const normalizeQualityFlags = (value: unknown): readonly SummaryQualityFlag[] => {
  const values = normalizeStringArray(value, 'qualityFlags');

  for (const flag of values) {
    if (!qualityFlags.has(flag as SummaryQualityFlag)) {
      throw new Error(`Invalid summary quality flag ${flag}`);
    }
  }

  return values as readonly SummaryQualityFlag[];
};

const normalizeConfidence = (value: unknown): SummaryConfidence => {
  const record = requiredRecord(value, 'confidence');
  const level = requiredString(record.level, 'confidence.level');
  const score = requiredNumber(record.score, 'confidence.score');

  if (!confidenceLevels.has(level as SummaryConfidence['level'])) {
    throw new Error('Invalid summary confidence level');
  }

  return {
    level: level as SummaryConfidence['level'],
    score,
    rationale: requiredString(record.rationale, 'confidence.rationale'),
  };
};

const assertDraftShape = (draft: GeneratedSummaryDraft): void => {
  if (draft.headline.trim().length === 0) {
    throw new Error('Summary headline must be non-empty');
  }

  if (draft.executiveSummary.trim().length === 0) {
    throw new Error('Summary executive summary must be non-empty');
  }

  const citationIds = new Set<string>();

  for (const citation of draft.citationMap) {
    if (citation.citationId.trim().length === 0) {
      throw new Error('Summary citation id must be non-empty');
    }

    if (citationIds.has(citation.citationId)) {
      throw new Error(`Duplicate summary citation id ${citation.citationId}`);
    }

    citationIds.add(citation.citationId);
  }

  for (const keyPoint of draft.keyPoints) {
    if (keyPoint.claim.trim().length === 0 || keyPoint.citationIds.length === 0) {
      throw new Error('Summary key point must include a claim and citations');
    }

    for (const citationId of keyPoint.citationIds) {
      if (!citationIds.has(citationId)) {
        throw new Error(`Summary key point cites unknown citation ${citationId}`);
      }
    }
  }

  for (const risk of draft.risksAndUnknowns) {
    if (risk.description.trim().length === 0) {
      throw new Error('Summary risk description must be non-empty');
    }

    for (const citationId of risk.citationIds ?? []) {
      if (!citationIds.has(citationId)) {
        throw new Error(`Summary risk cites unknown citation ${citationId}`);
      }
    }
  }

  for (const flag of draft.qualityFlags) {
    if (!qualityFlags.has(flag)) {
      throw new Error(`Invalid summary quality flag ${flag}`);
    }
  }

  if (draft.keyPoints.length === 0 && !draft.qualityFlags.includes('no_signal')) {
    throw new Error('No-signal summary must include no_signal quality flag');
  }

  if (draft.qualityFlags.includes('no_signal') && (draft.noSignalReason ?? '').trim().length === 0) {
    throw new Error('No-signal summary must include a reason');
  }

  if (draft.confidence.score < 0 || draft.confidence.score > 1) {
    throw new Error('Summary confidence score must be between 0 and 1');
  }

  if (draft.usage.inputTokens < 0 || draft.usage.outputTokens < 0 || draft.usage.estimatedCostUsd < 0) {
    throw new Error('Summary usage values must be non-negative');
  }
};

const resolveUsage = (
  responseJson: Record<string, unknown>,
  estimate: SummaryModelEstimate,
): SummaryModelEstimate => {
  const usage = asRecord(responseJson.usage);

  if (usage === null) {
    return estimate;
  }

  return {
    inputTokens: optionalNonNegativeInteger(usage.input_tokens) ?? estimate.inputTokens,
    outputTokens: optionalNonNegativeInteger(usage.output_tokens) ?? estimate.outputTokens,
    estimatedCostUsd: estimate.estimatedCostUsd,
  };
};

const extractOutputText = (responseJson: Record<string, unknown>): string | undefined => {
  if (typeof responseJson.output_text === 'string' && responseJson.output_text.trim().length > 0) {
    return responseJson.output_text;
  }

  const output = responseJson.output;

  if (!Array.isArray(output)) {
    return undefined;
  }

  for (const outputItem of output) {
    const outputRecord = asRecord(outputItem);

    if (outputRecord === null) {
      continue;
    }

    const content = outputRecord.content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      const contentRecord = asRecord(contentItem);

      if (contentRecord === null) {
        continue;
      }

      if (typeof contentRecord.text === 'string' && contentRecord.text.trim().length > 0) {
        return contentRecord.text;
      }
    }
  }

  return undefined;
};

const parseJsonObject = (value: string): Record<string, unknown> => {
  try {
    return requiredRecord(JSON.parse(value), 'OpenAI summary output');
  } catch (error) {
    throw new SummaryModelProviderError({
      kind: 'invalid_schema',
      retryable: false,
      message: error instanceof Error ? error.message : 'OpenAI summary output must be JSON',
    });
  }
};

const classifyOpenAiHttpFailure = (status: number, body: unknown): SummaryModelFailure => {
  const message = extractOpenAiErrorMessage(body) ?? `OpenAI summary request failed with HTTP ${status}`;

  if (status === 429) {
    return {
      kind: 'provider_rate_limited',
      retryable: true,
      message,
    };
  }

  if (status === 400 || status === 413) {
    return {
      kind: 'context_too_large',
      retryable: false,
      message,
    };
  }

  if (status === 401 || status === 403) {
    return {
      kind: 'provider_unavailable',
      retryable: false,
      message,
    };
  }

  if (status >= 500) {
    return {
      kind: 'provider_unavailable',
      retryable: true,
      message,
    };
  }

  return {
    kind: 'provider_unavailable',
    retryable: false,
    message,
  };
};

const readResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();

  if (text.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
};

const extractOpenAiErrorMessage = (body: unknown): string | undefined => {
  const record = asRecord(body);
  const error = asRecord(record?.error);
  const message = error?.message;

  return typeof message === 'string' && message.trim().length > 0 ? message : undefined;
};

const requiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  return value.trim();
};

const optionalString = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error('Optional summary string value must be a string');
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
};

const requiredNumber = (value: unknown, fieldName: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`);
  }

  return value;
};

const requiredArray = (value: unknown, fieldName: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array`);
  }

  return value;
};

const normalizeStringArray = (value: unknown, fieldName: string): readonly string[] => {
  const values = requiredArray(value, fieldName);

  return values.map((item, index) => requiredString(item, `${fieldName}[${index}]`));
};

const normalizeOptionalStringArray = (value: unknown): readonly string[] | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  return normalizeStringArray(value, 'optionalStringArray');
};

const requiredRecord = (value: unknown, fieldName: string): Record<string, unknown> => {
  const record = asRecord(value);

  if (record === null) {
    throw new Error(`${fieldName} must be an object`);
  }

  return record;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;

const optionalNonNegativeInteger = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;

const nonEmptyOrFallback = (value: string | undefined, fallback: string): string => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? fallback : trimmed;
};

const positiveIntegerOrFallback = (value: number | undefined, fallback: number): number =>
  Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback;

const nonNegativeNumberOrFallback = (value: number | undefined, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;

const parsePositiveInteger = (value: string | undefined): number | undefined => {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const parseNonNegativeNumber = (value: string | undefined): number | undefined => {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const openAiSummaryJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'headline',
    'executiveSummary',
    'keyPoints',
    'risksAndUnknowns',
    'sourceHighlights',
    'citationMap',
    'qualityFlags',
    'confidence',
    'noSignalReason',
  ],
  properties: {
    headline: { type: 'string', minLength: 1, maxLength: 180 },
    executiveSummary: { type: 'string', minLength: 1, maxLength: 2_000 },
    keyPoints: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'citationIds'],
        properties: {
          claim: { type: 'string', minLength: 1, maxLength: 500 },
          citationIds: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    risksAndUnknowns: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'citationIds', 'reason'],
        properties: {
          description: { type: 'string', minLength: 1, maxLength: 500 },
          citationIds: {
            type: ['array', 'null'],
            items: { type: 'string', minLength: 1 },
          },
          reason: {
            type: ['string', 'null'],
            enum: ['insufficient_evidence', 'conflicting_evidence', 'source_limit', null],
          },
        },
      },
    },
    sourceHighlights: {
      type: 'array',
      maxItems: 10,
      items: { type: 'string', minLength: 1, maxLength: 300 },
    },
    citationMap: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['citationId', 'feedItemId', 'sourceItemId', 'field'],
        properties: {
          citationId: { type: 'string', minLength: 1 },
          feedItemId: { type: 'string', minLength: 1 },
          sourceItemId: { type: 'string', minLength: 1 },
          field: { type: 'string', enum: ['title', 'bodyPreview', 'canonicalUrl'] },
        },
      },
    },
    qualityFlags: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['no_signal', 'low_confidence', 'conflicting_evidence', 'limited_sources'],
      },
    },
    confidence: {
      type: 'object',
      additionalProperties: false,
      required: ['level', 'score', 'rationale'],
      properties: {
        level: { type: 'string', enum: ['none', 'low', 'medium', 'high'] },
        score: { type: 'number', minimum: 0, maximum: 1 },
        rationale: { type: 'string', minLength: 1, maxLength: 500 },
      },
    },
    noSignalReason: { type: ['string', 'null'] },
  },
} as const;
