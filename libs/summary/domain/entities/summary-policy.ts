import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type SummaryPolicyLanguage = 'auto' | 'en' | 'ru';
export type SummaryPolicyFormat = 'executive_brief' | 'bullet_digest' | 'risk_brief';
export type SummaryPolicyTone = 'neutral' | 'concise' | 'analytical';

export type SummaryGenerationPolicy = {
  readonly language: SummaryPolicyLanguage;
  readonly format: SummaryPolicyFormat;
  readonly tone: SummaryPolicyTone;
  readonly maxKeyPoints: number;
  readonly includeRisks: boolean;
  readonly includeSourceHighlights: boolean;
  readonly customInstructions?: string;
  readonly rulesVersion: string;
};

export type SummaryPolicyProps = SummaryGenerationPolicy & {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

const supportedLanguages = new Set<SummaryPolicyLanguage>(['auto', 'en', 'ru']);
const supportedFormats = new Set<SummaryPolicyFormat>(['executive_brief', 'bullet_digest', 'risk_brief']);
const supportedTones = new Set<SummaryPolicyTone>(['neutral', 'concise', 'analytical']);
const maxCustomInstructionsLength = 1_200;

export const defaultSummaryGenerationPolicy = (): SummaryGenerationPolicy => ({
  language: 'auto',
  format: 'executive_brief',
  tone: 'neutral',
  maxKeyPoints: 5,
  includeRisks: true,
  includeSourceHighlights: true,
  rulesVersion: 'summary.rules.policy.v1',
});

export class SummaryPolicy {
  private constructor(private readonly props: SummaryPolicyProps) {}

  static create(props: Omit<SummaryPolicyProps, 'rulesVersion'> & { readonly rulesVersion?: string }): SummaryPolicy {
    const defaults = defaultSummaryGenerationPolicy();

    return new SummaryPolicy(this.normalize({
      ...props,
      rulesVersion: props.rulesVersion ?? defaults.rulesVersion,
    }));
  }

  static defaultForTopic(params: {
    readonly id: string;
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly topicId: string;
    readonly now: Date;
  }): SummaryPolicy {
    return SummaryPolicy.create({
      ...params,
      ...defaultSummaryGenerationPolicy(),
      createdAt: params.now,
      updatedAt: params.now,
    });
  }

  static rehydrate(props: SummaryPolicyProps): SummaryPolicy {
    return new SummaryPolicy(this.normalize(props));
  }

  update(params: {
    readonly language: SummaryPolicyLanguage;
    readonly format: SummaryPolicyFormat;
    readonly tone: SummaryPolicyTone;
    readonly maxKeyPoints: number;
    readonly includeRisks: boolean;
    readonly includeSourceHighlights: boolean;
    readonly customInstructions?: string;
    readonly updatedAt: Date;
  }): SummaryPolicy {
    return SummaryPolicy.create({
      ...this.props,
      ...params,
      rulesVersion: this.props.rulesVersion,
      createdAt: this.props.createdAt,
    });
  }

  toGenerationPolicy(): SummaryGenerationPolicy {
    return {
      language: this.props.language,
      format: this.props.format,
      tone: this.props.tone,
      maxKeyPoints: this.props.maxKeyPoints,
      includeRisks: this.props.includeRisks,
      includeSourceHighlights: this.props.includeSourceHighlights,
      customInstructions: this.props.customInstructions,
      rulesVersion: this.props.rulesVersion,
    };
  }

  toSnapshot(): SummaryPolicyProps {
    return { ...this.props };
  }

  private static normalize(props: SummaryPolicyProps): SummaryPolicyProps {
    if (props.id.trim().length === 0) {
      throw new Error('Summary policy id must be non-empty');
    }

    if (props.topicId.trim().length === 0) {
      throw new Error('Summary policy topic id must be non-empty');
    }

    if (!supportedLanguages.has(props.language)) {
      throw new Error('Unsupported summary policy language');
    }

    if (!supportedFormats.has(props.format)) {
      throw new Error('Unsupported summary policy format');
    }

    if (!supportedTones.has(props.tone)) {
      throw new Error('Unsupported summary policy tone');
    }

    if (!Number.isInteger(props.maxKeyPoints) || props.maxKeyPoints < 1 || props.maxKeyPoints > 10) {
      throw new Error('Summary policy maxKeyPoints must be an integer between 1 and 10');
    }

    const customInstructions = normalizeOptionalText(props.customInstructions);
    if ((customInstructions?.length ?? 0) > maxCustomInstructionsLength) {
      throw new Error('Summary policy custom instructions are too long');
    }

    if (props.rulesVersion.trim().length === 0) {
      throw new Error('Summary policy rules version must be non-empty');
    }

    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
      throw new Error('Summary policy updatedAt must not be before createdAt');
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
