import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import {
  DEFAULT_READER_SUMMARY_TIMEZONE,
  assertReaderSummaryTimezone,
  assertScheduledReaderSummaryCadence,
  scheduledReaderSummaryCadences,
  type ScheduledReaderSummaryCadence,
} from "../value-objects/reader-summary-period";
import type { ReaderSummaryScope } from "../value-objects/reader-summary-scope";
import { assertReaderSummaryScope } from "../value-objects/reader-summary-scope";

export type ReaderSummaryPolicyLanguage = "auto" | "en" | "ru";
export type ReaderSummaryPolicyFormat =
  | "executive_brief"
  | "bullet_digest"
  | "risk_brief";
export type ReaderSummaryPolicyTone = "neutral" | "concise" | "analytical";
export type ReaderSummaryDedupeStrategy = "canonical_url_then_title";

export type ReaderSummaryGenerationPolicy = {
  readonly language: ReaderSummaryPolicyLanguage;
  readonly format: ReaderSummaryPolicyFormat;
  readonly tone: ReaderSummaryPolicyTone;
  readonly maxStories: number;
  readonly includeRisks: boolean;
  readonly includeTopicHighlights: boolean;
  readonly includeRepeatedSignals: boolean;
  readonly dedupeStrategy: ReaderSummaryDedupeStrategy;
  readonly customInstructions?: string;
  readonly rulesVersion: string;
};

export type ReaderSummaryScheduleSettings = {
  readonly enabled: boolean;
  readonly timezone: string;
  readonly cadences: readonly ScheduledReaderSummaryCadence[];
};

export type ReaderSummaryPolicyProps = ReaderSummaryGenerationPolicy & {
  readonly id: string;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly schedule: ReaderSummaryScheduleSettings;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

const supportedLanguages = new Set<ReaderSummaryPolicyLanguage>([
  "auto",
  "en",
  "ru",
]);
const supportedFormats = new Set<ReaderSummaryPolicyFormat>([
  "executive_brief",
  "bullet_digest",
  "risk_brief",
]);
const supportedTones = new Set<ReaderSummaryPolicyTone>([
  "neutral",
  "concise",
  "analytical",
]);
const supportedDedupeStrategies = new Set<ReaderSummaryDedupeStrategy>([
  "canonical_url_then_title",
]);
const maxCustomInstructionsLength = 1_200;

export const defaultReaderSummaryGenerationPolicy =
  (): ReaderSummaryGenerationPolicy => ({
    language: "auto",
    format: "executive_brief",
    tone: "analytical",
    maxStories: 10,
    includeRisks: true,
    includeTopicHighlights: true,
    includeRepeatedSignals: true,
    dedupeStrategy: "canonical_url_then_title",
    rulesVersion: "reader_summary.rules.policy.v1",
  });

export const defaultReaderSummaryScheduleSettings =
  (): ReaderSummaryScheduleSettings => ({
    enabled: true,
    timezone: DEFAULT_READER_SUMMARY_TIMEZONE,
    cadences: [...scheduledReaderSummaryCadences],
  });

export class ReaderSummaryPolicy {
  private constructor(private readonly props: ReaderSummaryPolicyProps) {}

  static create(
    props: Omit<ReaderSummaryPolicyProps, "rulesVersion" | "schedule"> & {
      readonly rulesVersion?: string;
      readonly schedule?: ReaderSummaryScheduleSettings;
    },
  ): ReaderSummaryPolicy {
    const defaults = defaultReaderSummaryGenerationPolicy();

    return new ReaderSummaryPolicy(
      this.normalize({
        ...props,
        rulesVersion: props.rulesVersion ?? defaults.rulesVersion,
        schedule: props.schedule ?? defaultReaderSummaryScheduleSettings(),
      }),
    );
  }

  static defaultForScope(params: {
    readonly id: string;
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly scope: ReaderSummaryScope;
    readonly now: Date;
  }): ReaderSummaryPolicy {
    return ReaderSummaryPolicy.create({
      ...params,
      ...defaultReaderSummaryGenerationPolicy(),
      createdAt: params.now,
      updatedAt: params.now,
    });
  }

  static rehydrate(props: ReaderSummaryPolicyProps): ReaderSummaryPolicy {
    return new ReaderSummaryPolicy(this.normalize(props));
  }

  toGenerationPolicy(): ReaderSummaryGenerationPolicy {
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

  toScheduleSettings(): ReaderSummaryScheduleSettings {
    return {
      enabled: this.props.schedule.enabled,
      timezone: this.props.schedule.timezone,
      cadences: [...this.props.schedule.cadences],
    };
  }

  toSnapshot(): ReaderSummaryPolicyProps {
    return { ...this.props };
  }

  private static normalize(
    props: ReaderSummaryPolicyProps,
  ): ReaderSummaryPolicyProps {
    if (props.id.trim().length === 0) {
      throw new Error("Reader summary policy id must be non-empty");
    }

    assertReaderSummaryScope(props.scope);

    if (!supportedLanguages.has(props.language)) {
      throw new Error("Unsupported reader summary policy language");
    }

    if (!supportedFormats.has(props.format)) {
      throw new Error("Unsupported reader summary policy format");
    }

    if (!supportedTones.has(props.tone)) {
      throw new Error("Unsupported reader summary policy tone");
    }

    if (!supportedDedupeStrategies.has(props.dedupeStrategy)) {
      throw new Error("Unsupported reader summary dedupe strategy");
    }

    if (
      !Number.isInteger(props.maxStories) ||
      props.maxStories < 1 ||
      props.maxStories > 20
    ) {
      throw new Error(
        "Reader summary policy maxStories must be an integer between 1 and 20",
      );
    }

    const customInstructions = normalizeOptionalText(props.customInstructions);
    if ((customInstructions?.length ?? 0) > maxCustomInstructionsLength) {
      throw new Error("Reader summary policy custom instructions are too long");
    }

    if (props.rulesVersion.trim().length === 0) {
      throw new Error("Reader summary policy rules version must be non-empty");
    }

    const schedule = normalizeReaderSummaryScheduleSettings(props.schedule);

    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
      throw new Error(
        "Reader summary policy updatedAt must not be before createdAt",
      );
    }

    return {
      ...props,
      customInstructions,
      schedule,
    };
  }
}

const normalizeOptionalText = (
  value: string | undefined,
): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
};

const normalizeReaderSummaryScheduleSettings = (
  schedule: ReaderSummaryScheduleSettings,
): ReaderSummaryScheduleSettings => {
  if (typeof schedule.enabled !== "boolean") {
    throw new Error("Reader summary schedule enabled must be boolean");
  }

  assertReaderSummaryTimezone(schedule.timezone);

  const cadences = [...new Set(schedule.cadences)];
  if (cadences.length === 0) {
    throw new Error("Reader summary schedule must include at least one cadence");
  }

  for (const cadence of cadences) {
    assertScheduledReaderSummaryCadence(cadence);
  }

  return {
    enabled: schedule.enabled,
    timezone: schedule.timezone.trim(),
    cadences,
  };
};
