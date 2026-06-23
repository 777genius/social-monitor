import type {
  RecordUserSummaryPreferenceMemoryCommand,
  UserSummaryPreferenceMemoryProjectionResult,
  UserSummaryPreferenceMemoryProjectorPort,
} from '@social-monitor/subscriptions/ports';
import { redactSensitiveText } from '@social-monitor/shared-kernel';

import {
  createMemoStackMemoryClient,
  memoStackSourceRef,
  memoStackWorkflowIdempotencyKey,
  type MemoStackSummaryMemoryAdapterOptions,
  spaceSlug,
  subscriptionPreferenceScope,
  userPreferenceScope,
} from './memo-stack-summary-memory.adapter';

type MemoStackPreferenceClient = Pick<ReturnType<typeof createMemoStackMemoryClient>, 'workflows'>;

export class MemoStackUserSummaryPreferenceMemoryProjector implements UserSummaryPreferenceMemoryProjectorPort {
  private readonly client: MemoStackPreferenceClient;

  constructor(options: MemoStackSummaryMemoryAdapterOptions) {
    const baseUrl = options.baseUrl.trim();
    const token = options.token.trim();
    if (baseUrl.length === 0) {
      throw new Error('Memo-stack user summary preference memory baseUrl must be non-empty');
    }
    if (token.length === 0) {
      throw new Error('Memo-stack user summary preference memory token must be non-empty');
    }

    this.client = options.client ?? createMemoStackMemoryClient({
      baseUrl,
      token,
      timeoutMs: options.timeoutMs,
      fetchFn: options.fetchFn,
    });
  }

  async recordUserSummaryPreference(
    command: RecordUserSummaryPreferenceMemoryCommand,
  ): Promise<UserSummaryPreferenceMemoryProjectionResult> {
    const preferenceLines = userSummaryPreferenceLines(command);
    if (preferenceLines.length === 0) {
      return {
        status: 'skipped',
        diagnostics: { reason: 'empty_summary_preference' },
      };
    }

    const scope = memoryPreferenceScope(command);
    const idempotencyKey = memoStackWorkflowIdempotencyKey(
      'social-monitor:user-summary-preference',
      command.tenantId,
      command.workspaceId,
      command.preferenceId,
      command.updatedAt.toISOString(),
    );
    const response = await this.client.workflows.recordFeedback({
      spaceSlug: spaceSlug(command.tenantId, command.workspaceId),
      memoryScopeExternalRef: scope,
      sourceAgent: 'social-monitor.user-summary-preference',
      text: userSummaryPreferenceText(command, preferenceLines),
      idempotencyKey,
      sourceId: command.preferenceId,
      sourceRefs: preferenceSourceRefs(command),
      eventType: 'social-monitor.user_summary_preference.upserted',
      actorRole: 'user',
      sourceActorExternalRef: command.userId,
      occurredAt: command.updatedAt.toISOString(),
      metadata: {
        preference_id: command.preferenceId,
        user_id: command.userId,
        subscription_id: command.subscriptionId,
        topic_id: command.topicId,
        rules_version: command.rulesVersion,
        memory_scope_external_ref: scope,
      },
      rememberAsFact: true,
      factText: userSummaryPreferenceText(command, preferenceLines),
      factKind: 'user_preference',
      factCategory: 'summary_preference',
      factTags: userSummaryPreferenceTags(command, scope),
      factTtlPolicy: 'durable',
      factMemoryScopeExternalRef: scope,
    });

    return {
      status: 'written',
      diagnostics: {
        provider: 'memo-stack',
        workflow: 'recordFeedback',
        memoryScopeExternalRef: scope,
        captureId: nestedString(response.capture, ['data', 'id']),
        factId: nestedString(response.fact, ['data', 'id']),
      },
    };
  }
}

const memoryPreferenceScope = (command: RecordUserSummaryPreferenceMemoryCommand): string =>
  command.subscriptionId === undefined
    ? userPreferenceScope(command.userId)
    : subscriptionPreferenceScope(command.subscriptionId);

const preferenceSourceRefs = (command: RecordUserSummaryPreferenceMemoryCommand): readonly NonNullable<ReturnType<typeof memoStackSourceRef>>[] => {
  const sourceRef = memoStackSourceRef('social-monitor.user-summary-preference', command.preferenceId);

  return sourceRef === undefined ? [] : [sourceRef];
};

const userSummaryPreferenceLines = (
  command: RecordUserSummaryPreferenceMemoryCommand,
): readonly string[] => [
  command.language === undefined ? '' : `language=${command.language}`,
  command.format === undefined ? '' : `format=${command.format}`,
  command.tone === undefined ? '' : `tone=${command.tone}`,
  command.maxKeyPoints === undefined ? '' : `max_key_points=${command.maxKeyPoints}`,
  command.includeRisks === undefined ? '' : `include_risks=${command.includeRisks}`,
  command.includeSourceHighlights === undefined
    ? ''
    : `include_source_highlights=${command.includeSourceHighlights}`,
  command.customInstructions === undefined ? '' : `custom_instructions=${command.customInstructions}`,
].filter((line) => line.length > 0);

const userSummaryPreferenceText = (
  command: RecordUserSummaryPreferenceMemoryCommand,
  preferenceLines: readonly string[],
): string => [
  `Explicit user summary preference for user ${command.userId}.`,
  command.topicId === undefined ? '' : `Topic ${command.topicId}.`,
  command.subscriptionId === undefined ? '' : `Subscription ${command.subscriptionId}.`,
  `Rules version ${command.rulesVersion}.`,
  ...preferenceLines,
].map(redactSensitiveText).filter((line) => line.length > 0).join(' ');

const userSummaryPreferenceTags = (
  command: RecordUserSummaryPreferenceMemoryCommand,
  scope: string,
): readonly string[] => [
  'summary-preference',
  'explicit-user-preference',
  scope.startsWith('subscription:') ? 'subscription-preference' : 'user-preference',
  `rules-${command.rulesVersion}`,
  ...(command.language === undefined ? [] : [`language-${command.language}`]),
  ...(command.format === undefined ? [] : [`format-${command.format}`]),
  ...(command.tone === undefined ? [] : [`tone-${command.tone}`]),
];

const nestedString = (value: unknown, path: readonly string[]): string | undefined => {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' ? current : undefined;
};
