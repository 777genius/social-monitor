import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type {
  SummaryPolicyFormat,
  SummaryPolicyLanguage,
  SummaryPolicyTone,
} from '@social-monitor/summary/domain';

export type UserSummaryPreferenceOverlay = {
  readonly language?: SummaryPolicyLanguage;
  readonly format?: SummaryPolicyFormat;
  readonly tone?: SummaryPolicyTone;
  readonly maxKeyPoints?: number;
  readonly includeRisks?: boolean;
  readonly includeSourceHighlights?: boolean;
  readonly customInstructions?: string;
  readonly rulesVersion: string;
};

export type UserSummaryPreferenceProps = UserSummaryPreferenceOverlay & {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly subscriptionId?: string;
  readonly topicId?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

const supportedLanguages = new Set<SummaryPolicyLanguage>(['auto', 'en', 'ru']);
const supportedFormats = new Set<SummaryPolicyFormat>(['executive_brief', 'bullet_digest', 'risk_brief']);
const supportedTones = new Set<SummaryPolicyTone>(['neutral', 'concise', 'analytical']);
const maxCustomInstructionsLength = 1_200;

export class UserSummaryPreference {
  private constructor(private readonly props: UserSummaryPreferenceProps) {}

  static create(
    props: Omit<UserSummaryPreferenceProps, 'rulesVersion'> & { readonly rulesVersion?: string },
  ): UserSummaryPreference {
    return new UserSummaryPreference(this.normalize({
      ...props,
      rulesVersion: props.rulesVersion ?? 'summary.rules.user-preference.v1',
    }));
  }

  static rehydrate(props: UserSummaryPreferenceProps): UserSummaryPreference {
    return new UserSummaryPreference(this.normalize(props));
  }

  update(params: Omit<
    UserSummaryPreferenceOverlay,
    'rulesVersion'
  > & { readonly updatedAt: Date; readonly rulesVersion?: string }): UserSummaryPreference {
    return UserSummaryPreference.create({
      ...this.props,
      ...params,
      rulesVersion: params.rulesVersion ?? this.props.rulesVersion,
      createdAt: this.props.createdAt,
    });
  }

  toOverlay(): UserSummaryPreferenceOverlay {
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

  toSnapshot(): UserSummaryPreferenceProps {
    return { ...this.props };
  }

  private static normalize(props: UserSummaryPreferenceProps): UserSummaryPreferenceProps {
    const userId = props.userId.trim();
    const subscriptionId = normalizeOptionalText(props.subscriptionId);
    const topicId = normalizeOptionalText(props.topicId);
    const customInstructions = normalizeOptionalText(props.customInstructions);

    if (props.id.trim().length === 0) {
      throw new Error('User summary preference id must be non-empty');
    }

    if (userId.length === 0) {
      throw new Error('User summary preference user id must be non-empty');
    }

    if (subscriptionId === undefined && topicId === undefined) {
      throw new Error('User summary preference requires subscriptionId or topicId');
    }

    if (subscriptionId !== undefined && topicId !== undefined) {
      throw new Error('User summary preference cannot target both subscriptionId and topicId');
    }

    if (props.language !== undefined && !supportedLanguages.has(props.language)) {
      throw new Error('Unsupported user summary preference language');
    }

    if (props.format !== undefined && !supportedFormats.has(props.format)) {
      throw new Error('Unsupported user summary preference format');
    }

    if (props.tone !== undefined && !supportedTones.has(props.tone)) {
      throw new Error('Unsupported user summary preference tone');
    }

    if (
      props.maxKeyPoints !== undefined &&
      (!Number.isInteger(props.maxKeyPoints) || props.maxKeyPoints < 1 || props.maxKeyPoints > 10)
    ) {
      throw new Error('User summary preference maxKeyPoints must be an integer between 1 and 10');
    }

    if ((customInstructions?.length ?? 0) > maxCustomInstructionsLength) {
      throw new Error('User summary preference custom instructions are too long');
    }

    if (props.rulesVersion.trim().length === 0) {
      throw new Error('User summary preference rules version must be non-empty');
    }

    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
      throw new Error('User summary preference updatedAt must not be before createdAt');
    }

    return {
      ...props,
      userId,
      subscriptionId,
      topicId,
      customInstructions,
    };
  }
}

const normalizeOptionalText = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
};
