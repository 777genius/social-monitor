import { redactSensitiveText } from '@social-monitor/shared-kernel';
import type { Clock, JsonObject } from '@social-monitor/shared-kernel';
import type {
  FetchedSourceItem, ProviderFailure, SourceCapabilityProfile, SourceProviderPort,
    SourceProviderScanContext, SourceProviderScanPlan, SourceProviderScanResult, SourceQuery, SourcePaginationStopReason,
} from '../../../ports';
import { telegramPreviewConfig, validateTelegramQuery } from './telegram-preview-config';
import { TelegramPreviewError, type TelegramPreviewClientPort, type TelegramPreviewPost } from './telegram-preview-client.port';
import { readTelegramCursor, writeTelegramCursor } from './telegram-preview-cursor';

export const telegramPreviewCapability: SourceCapabilityProfile = {
  providerKey: 'telegram', displayName: 'Telegram public channels', version: 1, productionSafe: true,
  supportedContentUnits: ['post', 'link'], supportedQueryModes: ['account_feed', 'url'], cursorModel: 'since_id',
  stableIdentity: ['channel', 'messageId'], quotaModel: 'per_source_binding',
  limitations: ['Anonymous public web previews only; private channels, full media, comments and complete archives are not supported.',
    'Collection is polled and bounded. An incomplete scan retains its backfill position and reports coverage warnings.'],
};

export class TelegramSourceProvider implements SourceProviderPort {
  constructor(private readonly client: TelegramPreviewClientPort, private readonly clock: Clock) {}
  key(): string { return 'telegram'; }
  capabilityProfile(): SourceCapabilityProfile { return telegramPreviewCapability; }
  validateBinding(query: SourceQuery) {
    try { validateTelegramQuery(query); return { ok: true } as const; }
    catch (error) { return { ok: false, reason: error instanceof Error ? error.message : 'Invalid Telegram public channel' } as const; }
  }
  planScan(query: SourceQuery, context: SourceProviderScanContext): SourceProviderScanPlan {
    const config = telegramPreviewConfig(query, context.config);
    return { query, maxItems: config.maxItems };
  }

  async scan(plan: SourceProviderScanPlan, context: SourceProviderScanContext): Promise<SourceProviderScanResult> {
    const config = telegramPreviewConfig(plan.query, context.config);
    const prior = readTelegramCursor(plan.cursor, config.channel, config.scope);
    const maxItems = Math.min(plan.maxItems, config.maxItems);
    if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 500) throw new TelegramPreviewError('Invalid Telegram item budget', 'invalid_query', false);
    const now = this.clock.now().getTime();
    if (prior.retryAfterUntil !== undefined && prior.retryAfterUntil > now) {
      throw new TelegramPreviewError('Telegram public preview rate limit backoff', 'rate_limited', true, prior.retryAfterUntil - now);
    }
    let retryAfterUntil: number | undefined;
    let historyGap = prior.historyGap;
    const recordHistoryGap = (afterId: number, beforeId: number): void => {
      historyGap = { afterId: Math.min(historyGap?.afterId ?? afterId, afterId),
        beforeId: Math.max(historyGap?.beforeId ?? beforeId, beforeId) };
    };
    let pending = prior.pending;
    let beforeId = pending?.beforeId;
    let ceilingId = pending?.ceilingId ?? 0;
    const floorId = pending?.floorId ?? prior.lastId;
    const fromTime = pending?.fromTime ?? config.window?.start ?? (floorId > 0 ? 0 : Math.max(0, now - config.ageHours * 3_600_000));
    const untilTime = pending?.untilTime ?? config.window?.end ?? Number.MAX_SAFE_INTEGER;
    const items = new Map<number, FetchedSourceItem>();
    const seen = new Set<number>();
    const warnings = new Set<string>();
    let done = false;
    let pages = 0;
    let duplicates = 0;
    let reason: SourcePaginationStopReason = 'max_pages';
    for (let pageIndex = 0; pageIndex < config.maxPages; pageIndex += 1) {
      let page;
      try { page = await this.client.readPage(config.channel, beforeId); }
      catch (error) {
        if (beforeId !== undefined && error instanceof TelegramPreviewError && error.kind === 'unavailable' && !error.retryable) {
          recordHistoryGap(floorId, beforeId);
          warnings.add('telegram.collection_incomplete:history_unavailable');
          done = true; reason = 'no_next_cursor'; break;
        }
        if (pages === 0) throw error;
        if (error instanceof TelegramPreviewError && error.kind === 'rate_limited') {
          retryAfterUntil = this.clock.now().getTime() + Math.min(error.retryAfterMs ?? 60_000, 86_400_000);
        }
        warnings.add(`telegram.collection_incomplete:${error instanceof TelegramPreviewError && error.kind === 'rate_limited' ? 'rate_limited' : 'page_failure'}`);
        reason = 'partial_retryable_failure';
        break;
      }
      pages += 1;
      page.warnings.forEach((warning) => warnings.add(warning));
      const posts = [...page.posts].sort((a, b) => b.id - a.id);
      if (ceilingId === 0) ceilingId = Math.max(prior.lastId, posts[0]?.id ?? 0);
      if (posts.length === 0) {
        done = true;
        if (floorId > 0 && ceilingId > floorId) {
          const gapEnd = beforeId ?? ceilingId;
          recordHistoryGap(floorId, gapEnd);
        }
        reason = 'no_next_cursor';
        break;
      }
      let processedBefore: number | undefined;
      let itemBudgetReached = false;
      for (const post of posts) {
        if (post.id > ceilingId || (beforeId !== undefined && post.id >= beforeId)) continue;
        if (post.id <= floorId || (post.publishedAt !== undefined && post.publishedAt.getTime() < fromTime)) {
          done = true; reason = 'no_next_cursor'; break;
        }
        if (items.size >= maxItems) { itemBudgetReached = true; reason = 'target_items'; break; }
        processedBefore = post.id;
        if (seen.has(post.id)) { duplicates += 1; continue; }
        seen.add(post.id);
        if (post.publishedAt === undefined || post.text.trim().length === 0) {
          warnings.add('telegram.collection_incomplete:unsupported_post');
          continue;
        }
        if (post.publishedAt.getTime() >= untilTime) continue;
        if (post.incomplete) warnings.add('telegram.preview_content_incomplete');
        items.set(post.id, sourceItem(config.channel, post));
      }
      if (done) break;
      if (processedBefore === undefined || (beforeId !== undefined && processedBefore >= beforeId)) {
        warnings.add('telegram.collection_incomplete:pagination_not_advanced');
        reason = 'cursor_not_advanced'; break;
      }
      beforeId = processedBefore;
      pending = { beforeId, ceilingId, floorId, fromTime, untilTime };
      if (itemBudgetReached || items.size >= maxItems) { reason = 'target_items'; break; }
    }
    if (!done) {
      warnings.add(`telegram.collection_incomplete:${reason === 'target_items' ? 'max_items' : reason === 'max_pages' ? 'max_pages' : 'backfill_pending'}`);
      // No advancement on a non-progressing first page; retry the same range.
      pending ??= ceilingId > floorId ? { beforeId: beforeId ?? ceilingId + 1, ceilingId, floorId, fromTime, untilTime } : undefined;
    } else { pending = undefined; }
    if (historyGap !== undefined) warnings.add('telegram.collection_incomplete:history_gap');
    const partial = !done || [...warnings].some((warning) => warning.startsWith('telegram.collection_incomplete') || warning === 'telegram.preview_content_incomplete');
    warnings.add(partial ? 'telegram.collection_incomplete' : 'telegram.collection_complete');
    warnings.add(`telegram.collection_stats;pages=${pages};items=${items.size};duplicates=${duplicates};backfill=${pending !== undefined}`);
    const metadata: JsonObject = { status: partial ? 'partial' : 'complete', backfillPending: pending !== undefined,
      pageCount: pages, ...(historyGap === undefined ? {} : { historyGap }), completedThroughId: done ? ceilingId : prior.lastId, observedThroughId: ceilingId };
    return {
      items: [...items.values()].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime()).map((item) => ({
        ...item, metadata: { ...item.metadata, telegramCollection: metadata },
      })),
      nextCursor: writeTelegramCursor({ version: 1, channel: config.channel, scope: config.scope,
        lastId: done ? ceilingId : prior.lastId, ...(pending === undefined ? {} : { pending }),
        ...(retryAfterUntil === undefined ? {} : { retryAfterUntil }),
        ...(historyGap === undefined ? {} : { historyGap }) }),
      warnings: [...warnings],
      collection: { complete: !partial, backfillPending: pending !== undefined },
      pagination: { pageCount: pages, duplicateItemCount: duplicates, stopReason: reason },
    };
  }

  classifyError(error: unknown): ProviderFailure {
    if (error instanceof TelegramPreviewError) return {
      kind: error.kind, retryable: error.retryable, message: redactSensitiveText(error.message), retryAfterMs: error.retryAfterMs,
    };
    return { kind: 'unavailable', retryable: true, message: redactSensitiveText(error instanceof Error ? error.message : 'Telegram public preview request failed') };
  }
}

const sourceItem = (channel: string, post: TelegramPreviewPost): FetchedSourceItem => ({
  externalId: `${channel}/${post.id}`, canonicalUrl: `https://t.me/${channel}/${post.id}`,
  title: (post.text.split(/\n\s*\n/)[0] ?? post.text).replace(/\s+/g, ' ').slice(0, 160),
  body: post.text, authorHandle: `@${channel}`, publishedAt: post.publishedAt!,
  metadata: { channel, messageId: String(post.id), nativeContentComplete: !post.incomplete, nativeContentIncomplete: post.incomplete,
    telegramPreviewContentIncomplete: post.incomplete, externalLinks: [...post.links], ...(post.views === undefined ? {} : { views: post.views }) },
});
