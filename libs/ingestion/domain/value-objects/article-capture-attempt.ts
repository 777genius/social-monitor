import type { JsonObject } from '@social-monitor/shared-kernel';
import { ARTICLE_REPRESENTATION_VERSION, captureNativeText, readContentCapture } from './source-content-capture';

export type ArticleCaptureAttempt = {
  readonly version: 'article_capture_attempt.v1';
  readonly nativeRevision: string;
  readonly articleUrl: string;
  readonly representationVersion: string;
  readonly status: 'pending' | 'running' | 'retryable_failed' | 'permanent_failed' | 'succeeded';
  readonly attemptCount: number;
  readonly nextAttemptAt: string | null;
  readonly reasonCode: string;
  readonly reservationToken: string | null;
  readonly scanJobId: string | null;
  readonly scanFence: string | null;
  readonly leaseUntil: string | null;
};
type CaptureItem = {
  readonly body: string;
  readonly title: string;
  readonly canonicalUrl: string;
  readonly metadata?: JsonObject;
};
const MAX_ATTEMPTS = 3;
const retryDelay = (attempt: number): number => attempt <= 1 ? 60_000 : 300_000;

export const readArticleCaptureAttempt = (item: CaptureItem): ArticleCaptureAttempt | undefined => {
  const raw = item.metadata?.articleCaptureAttempt;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const value = raw as JsonObject;
  if (value.version !== 'article_capture_attempt.v1' || typeof value.nativeRevision !== 'string' ||
      typeof value.articleUrl !== 'string' || typeof value.attemptCount !== 'number' ||
      !Number.isInteger(value.attemptCount) || value.attemptCount < 0 || value.attemptCount > MAX_ATTEMPTS ||
      !['pending', 'running', 'retryable_failed', 'permanent_failed', 'succeeded'].includes(String(value.status))) return undefined;
  return value as unknown as ArticleCaptureAttempt;
};

export const prepareArticleCaptureAttempt = <T extends CaptureItem>(item: T, now: Date): T => {
  const capture = readContentCapture(item);
  if (capture?.articleUrl == null) return item;
  const previous = readArticleCaptureAttempt(item);
  if (previous !== undefined && previous.nativeRevision === capture.nativeRevision &&
      previous.articleUrl === capture.articleUrl && previous.representationVersion === ARTICLE_REPRESENTATION_VERSION) return item;
  const succeeded = capture.article?.extractionVersion === ARTICLE_REPRESENTATION_VERSION;
  return withAttempt(item, {
    version: 'article_capture_attempt.v1', nativeRevision: capture.nativeRevision,
    articleUrl: capture.articleUrl, representationVersion: ARTICLE_REPRESENTATION_VERSION,
    status: succeeded ? 'succeeded' : 'pending', attemptCount: 0,
    nextAttemptAt: succeeded ? null : now.toISOString(), reasonCode: succeeded ? 'article_reused' : 'capture_pending',
    reservationToken: null, scanJobId: null, scanFence: null, leaseUntil: null,
  });
};

// Only explicit old unfinished attempts are revisited; this is not a historical
// article backfill for every source that happens to have an external URL.
export const prepareLegacyArticleCapture = <T extends CaptureItem>(item: T, providerKey: string, now: Date): T => {
  if (readContentCapture(item) !== undefined) return prepareArticleCaptureAttempt(item, now);
  const raw = item.metadata?.articleContent;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return item;
  const status = raw as JsonObject;
  if (status.status !== 'failed' && !(status.status === 'skipped' &&
      (status.reason === 'scan item enrichment budget exceeded' || status.reasonCode === 'noise_gate' || status.reasonCode === 'scan_budget_exhausted'))) return item;
  return prepareArticleCaptureAttempt(captureNativeText(item, providerKey, now), now);
};

export const articleCaptureIsDue = (item: CaptureItem, now: Date): boolean => {
  const capture = readContentCapture(item);
  const attempt = readArticleCaptureAttempt(item);
  if (capture === undefined || attempt === undefined || attempt.articleUrl !== capture.articleUrl ||
      attempt.nativeRevision !== capture.nativeRevision || attempt.representationVersion !== ARTICLE_REPRESENTATION_VERSION ||
      capture.article?.extractionVersion === ARTICLE_REPRESENTATION_VERSION || attempt.attemptCount >= MAX_ATTEMPTS ||
      !['pending', 'retryable_failed', 'running'].includes(attempt.status) || attempt.nextAttemptAt === null) return false;
  return Number.isFinite(Date.parse(attempt.nextAttemptAt)) && Date.parse(attempt.nextAttemptAt) <= now.getTime() &&
    (attempt.status !== 'running' || (attempt.leaseUntil !== null && Date.parse(attempt.leaseUntil) <= now.getTime()));
};

export const reserveArticleCapture = <T extends CaptureItem>(item: T, reservation: {
  readonly now: Date;
  readonly token: string;
  readonly scanJobId: string;
  readonly scanFence: string;
  readonly leaseUntil: Date;
}): T | undefined => {
  if (!articleCaptureIsDue(item, reservation.now) || reservation.leaseUntil <= reservation.now) return undefined;
  const previous = readArticleCaptureAttempt(item)!;
  const attemptCount = previous.attemptCount + 1;
  return withAttempt(item, {
    ...previous, status: 'running', attemptCount, reservationToken: reservation.token,
    scanJobId: reservation.scanJobId, scanFence: reservation.scanFence,
    leaseUntil: reservation.leaseUntil.toISOString(), reasonCode: 'capture_dispatched',
    // A crashed dispatch remains spent. Another scan waits for this deadline
    // and backoff before reserving a new attempt; there is no inline HTTP retry.
    nextAttemptAt: new Date(reservation.leaseUntil.getTime() + retryDelay(attemptCount)).toISOString(),
  });
};

export const articleCaptureCompletionMatches = (current: CaptureItem, expected: ArticleCaptureAttempt, now: Date): boolean => {
  const capture = readContentCapture(current);
  const attempt = readArticleCaptureAttempt(current);
  return capture !== undefined && attempt !== undefined && attempt.status === 'running' &&
    attempt.reservationToken === expected.reservationToken && expected.reservationToken !== null &&
    attempt.scanFence === expected.scanFence && attempt.scanJobId === expected.scanJobId &&
    attempt.nativeRevision === expected.nativeRevision && capture.nativeRevision === expected.nativeRevision &&
    attempt.articleUrl === expected.articleUrl && capture.articleUrl === expected.articleUrl &&
    attempt.representationVersion === expected.representationVersion &&
    attempt.leaseUntil !== null && Date.parse(attempt.leaseUntil) > now.getTime();
};

// A reservation that never dispatched is refundable. An in-flight timeout is
// deliberately not refundable because the remote request may have happened.
export const releaseUndispatchedArticleCapture = <T extends CaptureItem>(item: T, now: Date): T => {
  const attempt = readArticleCaptureAttempt(item);
  if (attempt === undefined || attempt.status !== 'running') throw new Error('Undispatched release requires a reservation');
  return withAttempt(item, {
    ...attempt, status: 'pending', attemptCount: Math.max(0, attempt.attemptCount - 1),
    nextAttemptAt: now.toISOString(), reasonCode: 'scan_budget_exhausted',
    reservationToken: null, scanJobId: null, scanFence: null, leaseUntil: null,
  });
};

export type ArticleCaptureOutcome =
  | { readonly kind: 'succeeded' }
  | { readonly kind: 'permanent_failed'; readonly reasonCode: string }
  | { readonly kind: 'retryable_failed'; readonly reasonCode: string; readonly retryAfter?: Date };

export const finishArticleCapture = <T extends CaptureItem>(item: T, outcome: ArticleCaptureOutcome, now: Date): T => {
  const attempt = readArticleCaptureAttempt(item);
  if (attempt === undefined || attempt.status !== 'running') throw new Error('Capture completion requires a reservation');
  const exhausted = outcome.kind === 'retryable_failed' && attempt.attemptCount >= MAX_ATTEMPTS;
  return withAttempt(item, {
    ...attempt,
    status: exhausted ? 'permanent_failed' : outcome.kind,
    nextAttemptAt: outcome.kind !== 'retryable_failed' || exhausted ? null : new Date(Math.max(
      now.getTime() + retryDelay(attempt.attemptCount),
      outcome.retryAfter !== undefined && Number.isFinite(outcome.retryAfter.getTime()) ? outcome.retryAfter.getTime() : 0,
    )).toISOString(),
    reasonCode: exhausted ? 'retry_exhausted' : outcome.kind === 'succeeded' ? 'capture_succeeded' : outcome.reasonCode,
    reservationToken: null, scanJobId: null, scanFence: null, leaseUntil: null,
  });
};

const withAttempt = <T extends CaptureItem>(item: T, attempt: ArticleCaptureAttempt): T => ({
  ...item, metadata: { ...item.metadata, articleCaptureAttempt: attempt as unknown as JsonObject },
});
