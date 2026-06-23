import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { BriefingScope } from '../value-objects/briefing-scope';
import { assertBriefingScope } from '../value-objects/briefing-scope';

export type BriefingPolicyLanguage = 'auto' | 'en' | 'ru';
export type BriefingPolicyFormat = 'executive_brief' | 'bullet_digest' | 'risk_brief';
export type BriefingPolicyTone = 'neutral' | 'concise' | 'analytical';
export type BriefingDedupeStrategy = 'canonical_url_then_title';

export type BriefingGenerationPolicy = {
  readonly language: BriefingPolicyLanguage;
  readonly format: BriefingPolicyFormat;
  readonly tone: BriefingPolicyTone;
  readonly maxStories: number;
  readonly includeRisks: boolean;
  readonly includeTopicHighlights: boolean;
  readonly includeRepeatedSignals: boolean;
  readonly dedupeStrategy: BriefingDedupeStrategy;
  readonly customInstructions?: string;
  readonly rulesVersion: string;
};

export type BriefingPolicyProps = BriefingGenerationPolicy & {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: BriefingScope;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

const supportedLanguages = new Set<BriefingPolicyLanguage>(['auto', 'en', 'ru']);
const supportedFormats = new Set<BriefingPolicyFormat>(['executive_brief', 'bullet_digest', 'risk_brief']);
const supportedTones = new Set<BriefingPolicyTone>(['neutral', 'concise', 'analytical']);
const supportedDedupeStrategies = new Set<BriefingDedupeStrategy>(['canonical_url_then_title']);
const maxCustomInstructionsLength = 1_200;

export const defaultBriefingGenerationPolicy = (): BriefingGenerationPolicy => ({
  language: 'auto',
  format: 'executive_brief',
  tone: 'analytical',
  maxStories: 10,
  includeRisks: true,
  includeTopicHighlights: true,
  includeRepeatedSignals: true,
  dedupeStrategy: 'canonical_url_then_title',
  rulesVersion: 'briefing.rules.policy.v1',
});

export class BriefingPolicy {
  private constructor(private readonly props: BriefingPolicyProps) {}

  static create(props: Omit<BriefingPolicyProps, 'rulesVersion'> & { readonly rulesVersion?: string }): BriefingPolicy {
    const defaults = defaultBriefingGenerationPolicy();

    return new BriefingPolicy(this.normalize({
      ...props,
      rulesVersion: props.rulesVersion ?? defaults.rulesVersion,
    }));
  }

  static defaultForScope(params: {
    readonly id: string;
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly scope: BriefingScope;
    readonly now: Date;
  }): BriefingPolicy {
    return BriefingPolicy.create({
      ...params,
      ...defaultBriefingGenerationPolicy(),
      createdAt: params.now,
      updatedAt: params.now,
    });
  }

  static rehydrate(props: BriefingPolicyProps): BriefingPolicy {
    return new BriefingPolicy(this.normalize(props));
  }

  toGenerationPolicy(): BriefingGenerationPolicy {
    return {
      language: this.props.language,
      format: this.props.format,
      tone: this.props.tone,
      maxStories: this.props.maxStories,
      includeRisks: this.props.includeRisks,
      includeTopicHighlights: this.props.includeTopicHighlights,
      includeRepeatedSignals: this.props.includeRepeatedSignals,
      dedupeStrategy: this.props.dedupeStrategy,
      customInstructions: this.props.customInstructions,
      rulesVersion: this.props.rulesVersion,
    };
  }

  toSnapshot(): BriefingPolicyProps {
    return { ...this.props };
  }

  private static normalize(props: BriefingPolicyProps): BriefingPolicyProps {
    if (props.id.trim().length === 0) {
      throw new Error('Briefing policy id must be non-empty');
    }

    assertBriefingScope(props.scope);

    if (!supportedLanguages.has(props.language)) {
      throw new Error('Unsupported briefing policy language');
    }

    if (!supportedFormats.has(props.format)) {
      throw new Error('Unsupported briefing policy format');
    }

    if (!supportedTones.has(props.tone)) {
      throw new Error('Unsupported briefing policy tone');
    }

    if (!supportedDedupeStrategies.has(props.dedupeStrategy)) {
      throw new Error('Unsupported briefing dedupe strategy');
    }

    if (!Number.isInteger(props.maxStories) || props.maxStories < 1 || props.maxStories > 20) {
      throw new Error('Briefing policy maxStories must be an integer between 1 and 20');
    }

    const customInstructions = normalizeOptionalText(props.customInstructions);
    if ((customInstructions?.length ?? 0) > maxCustomInstructionsLength) {
      throw new Error('Briefing policy custom instructions are too long');
    }

    if (props.rulesVersion.trim().length === 0) {
      throw new Error('Briefing policy rules version must be non-empty');
    }

    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
      throw new Error('Briefing policy updatedAt must not be before createdAt');
    }

    return {
      ...props,
      customInstructions,
    };
  }
}

const normalizeOptionalText = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
};
