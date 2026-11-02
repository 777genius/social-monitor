import { readerPromotionProviderIsPost } from "../../domain/policies/reader-promotion-source-registry";
import { DomainError, err, ok, type Result, type Clock } from "@social-monitor/shared-kernel";
import type { ReaderPost, ReaderPostCatalog, ReaderPostWindow } from "../../application/contracts/reader-post-catalog";
import { readerPostsInBrowseOrder } from "../../domain/policies/reader-post-browse-order";
import { readerValueSha256 } from "@social-monitor/relevance/domain/reader-value/reader-value-config";

export type ListReaderPostsQuery = ReaderPostWindow & {
  readonly order: "model" | "likes";
  readonly limit: number;
  readonly cursor?: string;
  readonly excludedProviders?: readonly string[];
};
export type ReaderPostsPage = {
  readonly items: readonly ReaderPost[];
  readonly total: number;
  readonly providerKeys: readonly string[];
  readonly nextCursor?: string;
};

export class ListReaderPostsUseCase {
  constructor(private readonly catalog: ReaderPostCatalog,
    private readonly clock: Clock) {}

  async execute(query: ListReaderPostsQuery): Promise<Result<ReaderPostsPage, DomainError>> {
    if (!Number.isFinite(query.startedAt.getTime()) || !Number.isFinite(query.endedAt.getTime()) ||
        query.startedAt >= query.endedAt || query.endedAt.getTime() - query.startedAt.getTime() > 32 * 86400000 ||
        !Number.isInteger(query.limit) || query.limit < 1 || query.limit > 100 ||
        !["model", "likes"].includes(query.order)) {
      return err(new DomainError("validation.failed", "Invalid post window or page"));
    }
    const readCutoff = this.clock.now().toISOString();
    let posts: readonly ReaderPost[];
    try { posts = await this.catalog.read(query); } catch (error) {
      if (error instanceof DomainError) return err(error);
      throw error;
    }
    posts = posts.filter((post) => readerPromotionProviderIsPost(post.providerKey));
    if (posts.length > 20_000) return err(new DomainError("operation.conflict", "Post window is too large; choose a shorter period"));
    const ranked = readerPostsInBrowseOrder(posts, query.order, readCutoff);
    const providerKeys = [...new Set(posts.map((post) => post.providerKey))].sort();
    const ordered = ranked.filter((post) => !query.excludedProviders?.includes(post.providerKey));
    const identity = readerValueSha256(JSON.stringify([
      query.tenantId, query.workspaceId, query.interestId, query.startedAt, query.endedAt,
      query.order, query.excludedProviders, ordered,
    ]));
    let offset = 0;
    if (query.cursor !== undefined) {
      if (query.cursor.length > 512) return err(new DomainError("validation.failed", "Invalid post cursor"));
      let parsed: unknown;
      try { parsed = JSON.parse(Buffer.from(query.cursor, "base64url").toString()); }
      catch { return err(new DomainError("validation.failed", "Invalid post cursor")); }
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return err(new DomainError("validation.failed", "Invalid post cursor"));
      }
      const cursor = parsed as { identity?: unknown; offset?: unknown };
      if (typeof cursor.offset !== "number" || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0) {
        return err(new DomainError("validation.failed", "Invalid post cursor"));
      }
      if (cursor.identity !== identity) return err(new DomainError("operation.conflict", "Posts changed; reload the list"));
      offset = cursor.offset;
    }
    const items = ordered.slice(offset, offset + query.limit);
    const next = offset + items.length;
    return ok({ items, total: ordered.length, providerKeys,
      ...(next < ordered.length ? { nextCursor: Buffer.from(JSON.stringify({ identity, offset: next })).toString("base64url") } : {}),
    });
  }
}
