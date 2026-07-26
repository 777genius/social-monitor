import {
  runWithTenantDatabaseAccess,
  withPrismaWriteRetry,
} from "@social-monitor/platform-persistence";
import type { Clock } from "@social-monitor/shared-kernel";

import type {
  SocialResearchResultCachePort,
  SocialResearchResultCacheScope,
} from "../../application/contracts/social-research-execution-policy";
import type {
  SocialSearchRun,
  SocialThread,
} from "../../application/contracts/social-research-gateway";
import type { PrismaSocialResearchResultCacheClient } from "./prisma-social-research-client";
import {
  decodeSocialResearchResultCachePayload,
  encodeSocialResearchResultCachePayload,
} from "./social-research-result-cache-payload";

export type PrismaSocialResearchResultCacheOptions = {
  readonly clock: Clock;
  readonly ttlMs: number;
  readonly maxEntries?: number;
};

type CacheKind = "search" | "thread";

type CacheRecord = {
  readonly payload: unknown;
  readonly expires_at: Date | string;
};

export class PrismaSocialResearchResultCache implements SocialResearchResultCachePort {
  constructor(
    private readonly prisma: PrismaSocialResearchResultCacheClient,
    private readonly options: PrismaSocialResearchResultCacheOptions,
  ) {
    if (!Number.isInteger(options.ttlMs) || options.ttlMs < 1) {
      throw new Error("Social research Prisma cache ttlMs must be positive");
    }

    if (
      options.maxEntries !== undefined &&
      (!Number.isInteger(options.maxEntries) || options.maxEntries < 1)
    ) {
      throw new Error(
        "Social research Prisma cache maxEntries must be positive",
      );
    }
  }

  async readSearch(
    cacheKey: string,
    scope?: SocialResearchResultCacheScope,
  ): Promise<SocialSearchRun | null> {
    return this.read<SocialSearchRun>("search", cacheKey, scope);
  }

  async writeSearch(
    cacheKey: string,
    run: SocialSearchRun,
    scope?: SocialResearchResultCacheScope,
  ): Promise<void> {
    await this.write("search", cacheKey, run, scope);
  }

  async readThread(
    cacheKey: string,
    scope?: SocialResearchResultCacheScope,
  ): Promise<SocialThread | null> {
    return this.read<SocialThread>("thread", cacheKey, scope);
  }

  async writeThread(
    cacheKey: string,
    thread: SocialThread,
    scope?: SocialResearchResultCacheScope,
  ): Promise<void> {
    await this.write("thread", cacheKey, thread, scope);
  }

  private async read<TValue>(
    kind: CacheKind,
    cacheKey: string,
    scope: SocialResearchResultCacheScope | undefined,
  ): Promise<TValue | null> {
    const requiredScope = requireCacheScope(scope);
    return runWithTenantDatabaseAccess(requiredScope, async () => {
      const records = await this.prisma.$queryRaw<readonly CacheRecord[]>`
        SELECT "payload", "expires_at"
        FROM "social_research_result_cache_entries"
        WHERE "tenant_id" = ${requiredScope.tenantId}::uuid
          AND "workspace_id" = ${requiredScope.workspaceId}::uuid
          AND "kind" = ${kind}
          AND "cache_key" = ${cacheKey}
        LIMIT 1
      `;
      const record = records[0];
      if (record === undefined) {
        return null;
      }

      if (
        toDate(record.expires_at).getTime() <=
        this.options.clock.now().getTime()
      ) {
        await this.deleteEntry(kind, cacheKey, requiredScope);

        return null;
      }

      return decodeSocialResearchResultCachePayload<TValue>(record.payload);
    });
  }

  private async write(
    kind: CacheKind,
    cacheKey: string,
    value: SocialSearchRun | SocialThread,
    scope: SocialResearchResultCacheScope | undefined,
  ): Promise<void> {
    const requiredScope = requireCacheScope(scope);
    const now = this.options.clock.now();
    const expiresAt = new Date(now.getTime() + this.options.ttlMs);
    const payload = JSON.stringify(
      encodeSocialResearchResultCachePayload(value),
    );

    await runWithTenantDatabaseAccess(requiredScope, () =>
      withPrismaWriteRetry(async () => {
        await this.prisma.$executeRaw`
          INSERT INTO "social_research_result_cache_entries" (
            "tenant_id",
            "workspace_id",
            "kind",
            "cache_key",
            "payload",
            "expires_at",
            "created_at",
            "updated_at"
          )
          VALUES (
            ${requiredScope.tenantId}::uuid,
            ${requiredScope.workspaceId}::uuid,
            ${kind},
            ${cacheKey},
            ${payload}::jsonb,
            ${expiresAt},
            ${now},
            ${now}
          )
          ON CONFLICT ("tenant_id", "workspace_id", "kind", "cache_key")
          DO UPDATE SET
            "payload" = EXCLUDED."payload",
            "expires_at" = EXCLUDED."expires_at",
            "updated_at" = EXCLUDED."updated_at"
        `;
        await this.enforceMaxEntries(kind, requiredScope);
      }),
    );
  }

  private async deleteEntry(
    kind: CacheKind,
    cacheKey: string,
    scope: SocialResearchResultCacheScope,
  ): Promise<void> {
    await withPrismaWriteRetry(
      () => this.prisma.$executeRaw`
      DELETE FROM "social_research_result_cache_entries"
      WHERE "tenant_id" = ${scope.tenantId}::uuid
        AND "workspace_id" = ${scope.workspaceId}::uuid
        AND "kind" = ${kind}
        AND "cache_key" = ${cacheKey}
    `,
    );
  }

  private async enforceMaxEntries(
    kind: CacheKind,
    scope: SocialResearchResultCacheScope,
  ): Promise<void> {
    const maxEntries = this.options.maxEntries;
    if (maxEntries === undefined) {
      return;
    }

    await this.prisma.$executeRaw`
      DELETE FROM "social_research_result_cache_entries"
      WHERE "tenant_id" = ${scope.tenantId}::uuid
        AND "workspace_id" = ${scope.workspaceId}::uuid
        AND "kind" = ${kind}
        AND "cache_key" IN (
          SELECT "cache_key"
          FROM "social_research_result_cache_entries"
          WHERE "tenant_id" = ${scope.tenantId}::uuid
            AND "workspace_id" = ${scope.workspaceId}::uuid
            AND "kind" = ${kind}
          ORDER BY "updated_at" DESC, "cache_key" DESC
          OFFSET ${maxEntries}
        )
    `;
  }
}

const requireCacheScope = (
  scope: SocialResearchResultCacheScope | undefined,
): SocialResearchResultCacheScope => {
  if (scope === undefined) {
    throw new Error(
      "Prisma social research result cache requires tenant/workspace scope",
    );
  }

  return scope;
};

const toDate = (value: Date | string): Date =>
  value instanceof Date ? value : new Date(value);
