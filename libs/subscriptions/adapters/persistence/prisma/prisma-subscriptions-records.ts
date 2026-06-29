import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import type {
  SummaryPolicyFormat,
  SummaryPolicyLanguage,
  SummaryPolicyTone,
} from '@social-monitor/summary/domain';

import {
  SourceTarget,
  type SourceTargetKind,
  type SourceTargetProps,
  UserSubscription,
  type UserSubscriptionProps,
  type UserSubscriptionScheduleProps,
  type UserSubscriptionScheduleStatus,
  type UserSubscriptionStatus,
  UserSubscriptionSchedule,
  UserSummaryPreference,
  type UserSummaryPreferenceProps,
} from '../../../domain';

export type PrismaUserSubscriptionStatus = 'ENABLED' | 'PAUSED' | 'CANCELLED';
export type PrismaUserSubscriptionScheduleStatus = 'ENABLED' | 'DISABLED';

export type PrismaSourceTargetRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly providerKey: string;
  readonly targetKind: string;
  readonly targetValue: string;
  readonly normalizedKey: string;
  readonly config: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type PrismaUserSubscriptionRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly sourceTargetId: string;
  readonly status: PrismaUserSubscriptionStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type PrismaUserSubscriptionScheduleRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly subscriptionId: string;
  readonly recipientKey: string;
  readonly channel: string;
  readonly intervalSeconds: number;
  readonly includeNoSignal: boolean;
  readonly nextRunAt: Date;
  readonly status: PrismaUserSubscriptionScheduleStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type PrismaUserSummaryPreferenceRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly subscriptionId: string | null;
  readonly interestId: string | null;
  readonly language: string | null;
  readonly format: string | null;
  readonly tone: string | null;
  readonly maxKeyPoints: number | null;
  readonly includeRisks: boolean | null;
  readonly includeSourceHighlights: boolean | null;
  readonly customInstructions: string | null;
  readonly rulesVersion: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export const sourceTargetFromPrisma = (record: PrismaSourceTargetRecord): SourceTarget =>
  SourceTarget.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    providerKey: record.providerKey,
    targetKind: normalizeTargetKind(record.targetKind),
    targetValue: record.targetValue,
    normalizedKey: record.normalizedKey,
    config: normalizeJsonObject(record.config),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  } satisfies SourceTargetProps);

export const userSubscriptionFromPrisma = (record: PrismaUserSubscriptionRecord): UserSubscription =>
  UserSubscription.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    userId: record.userId,
    sourceTargetId: record.sourceTargetId,
    status: subscriptionStatusFromPrisma(record.status),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  } satisfies UserSubscriptionProps);

export const userSubscriptionScheduleFromPrisma = (
  record: PrismaUserSubscriptionScheduleRecord,
): UserSubscriptionSchedule =>
  UserSubscriptionSchedule.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    subscriptionId: record.subscriptionId,
    recipientKey: record.recipientKey,
    channel: normalizeChannel(record.channel),
    intervalSeconds: record.intervalSeconds,
    includeNoSignal: record.includeNoSignal,
    nextRunAt: record.nextRunAt,
    status: scheduleStatusFromPrisma(record.status),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  } satisfies UserSubscriptionScheduleProps);

export const userSummaryPreferenceFromPrisma = (
  record: PrismaUserSummaryPreferenceRecord,
): UserSummaryPreference =>
  UserSummaryPreference.rehydrate({
    id: record.id,
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    userId: record.userId,
    subscriptionId: record.subscriptionId ?? undefined,
    interestId: record.interestId ?? undefined,
    language: normalizeLanguage(record.language),
    format: normalizeFormat(record.format),
    tone: normalizeTone(record.tone),
    maxKeyPoints: record.maxKeyPoints ?? undefined,
    includeRisks: record.includeRisks ?? undefined,
    includeSourceHighlights: record.includeSourceHighlights ?? undefined,
    customInstructions: record.customInstructions ?? undefined,
    rulesVersion: record.rulesVersion,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  } satisfies UserSummaryPreferenceProps);

export const subscriptionStatusToPrisma = (status: UserSubscriptionStatus): PrismaUserSubscriptionStatus => {
  if (status === 'enabled') {
    return 'ENABLED';
  }

  if (status === 'paused') {
    return 'PAUSED';
  }

  return 'CANCELLED';
};

export const scheduleStatusToPrisma = (
  status: UserSubscriptionScheduleStatus,
): PrismaUserSubscriptionScheduleStatus => status === 'enabled' ? 'ENABLED' : 'DISABLED';

const subscriptionStatusFromPrisma = (status: PrismaUserSubscriptionStatus): UserSubscriptionStatus => {
  if (status === 'ENABLED') {
    return 'enabled';
  }

  if (status === 'PAUSED') {
    return 'paused';
  }

  return 'cancelled';
};

const scheduleStatusFromPrisma = (status: PrismaUserSubscriptionScheduleStatus): UserSubscriptionScheduleStatus =>
  status === 'ENABLED' ? 'enabled' : 'disabled';

const normalizeTargetKind = (value: string): SourceTargetKind => {
  if (
    value === 'subreddit' ||
    value === 'interest' ||
    value === 'search_query' ||
    value === 'repository' ||
    value === 'account' ||
    value === 'url'
  ) {
    return value;
  }

  throw new Error(`Unsupported source target kind "${value}"`);
};

const normalizeLanguage = (value: string | null): SummaryPolicyLanguage | undefined => {
  if (value === null || value === 'auto' || value === 'en' || value === 'ru') {
    return value ?? undefined;
  }

  throw new Error(`Unsupported user summary preference language "${value}"`);
};

const normalizeFormat = (value: string | null): SummaryPolicyFormat | undefined => {
  if (
    value === null ||
    value === 'executive_brief' ||
    value === 'bullet_digest' ||
    value === 'risk_brief'
  ) {
    return value ?? undefined;
  }

  throw new Error(`Unsupported user summary preference format "${value}"`);
};

const normalizeTone = (value: string | null): SummaryPolicyTone | undefined => {
  if (value === null || value === 'neutral' || value === 'concise' || value === 'analytical') {
    return value ?? undefined;
  }

  throw new Error(`Unsupported user summary preference tone "${value}"`);
};

const normalizeChannel = (value: string) => {
  if (value === 'in_app' || value === 'email' || value === 'webhook') {
    return value;
  }

  throw new Error(`Unsupported user subscription schedule channel "${value}"`);
};

const normalizeJsonObject = (value: unknown): Readonly<Record<string, unknown>> => {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }

  return {};
};
