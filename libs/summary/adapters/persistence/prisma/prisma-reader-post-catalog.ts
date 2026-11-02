import { validateReaderValueAnswers } from "@social-monitor/relevance/domain/reader-value/reader-value-assessment";
import type { ReaderPostAssessmentIdentity, ReaderPostAssessmentIdentityBuilder } from "../../../application/contracts/reader-post-assessment-identity";
import { readerBrowseSourceEngagement } from "../../evidence/reader-browse-source-engagement";
import type { SourceContentSafetyPolicy } from "@social-monitor/relevance/domain/source-content-safety";
import { runWithTenantDatabaseAccess } from "@social-monitor/platform-persistence";
import { DomainError } from "@social-monitor/shared-kernel";
import type { JsonObject } from "@social-monitor/shared-kernel";
import { READER_POST_CANDIDATE_BUDGET, type ReaderPost, type ReaderPostCatalog, type ReaderPostWindow } from "../../../application/contracts/reader-post-catalog";
import { readerPromotionSourceForProviderKey } from "../../../domain/policies/reader-promotion-source-registry";

export interface ReaderPostsSqlClient {
  $transaction<T>(operation: (tx: {
    $queryRawUnsafe<T>(sql: string, ...values: unknown[]): Promise<T>;
    $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number>;
  }) => Promise<T>, options: { isolationLevel: "Serializable"; timeout: number; maxWait: number }): Promise<T>;
}

type PostRow = {
  id: string; source_item_id: string; provider_key: string;
  title: string; title_preview: string; body_preview: string; canonical_url: string; published_at: string;
  provider_metadata: JsonObject | null; engagement_observed_at: string | null;
  interest_id: string; interest_query: string; content_hash: string;
  body: string; source_metadata: JsonObject | null; input_bytes: string;
  content_kind: string | null;
};

/** Read-only browse projection. It never queues assessments or publishes cards. */
export class PrismaReaderPostCatalog implements ReaderPostCatalog {
  constructor(private readonly client: ReaderPostsSqlClient,
    private readonly safety: SourceContentSafetyPolicy,
    private readonly assessment: ReaderPostAssessmentIdentityBuilder) {}

  async read(window: ReaderPostWindow): Promise<readonly ReaderPost[]> {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY, DEFERRABLE");
      return runWithTenantDatabaseAccess(window, async () => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5000ms'");
      await tx.$executeRawUnsafe("SELECT set_config('social_monitor.tenant_id',$1,true),set_config('social_monitor.workspace_id',$2,true),set_config('social_monitor.system_access','false',true)", window.tenantId, window.workspaceId);
      const rows = await tx.$queryRawUnsafe<PostRow[]>(`
        WITH visible AS MATERIALIZED (
        SELECT f.id::text AS id,s.id::text AS source_item_id,
          s.provider_key,s.title,s.body,s.canonical_url,
          f.interest_id::text AS interest_id,i.query AS interest_query,
          s.content_hash,s.metadata AS source_metadata,
          octet_length(s.title)::bigint+octet_length(s.body)+octet_length(i.query)+octet_length(s.canonical_url)+
            COALESCE(octet_length(s.metadata::text),0)+COALESCE(octet_length(f.provider_metadata::text),0) AS source_bytes,
          to_char(f.published_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS published_at,
          f.provider_metadata,
          to_char(e.last_observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS engagement_observed_at,
          f.provider_metadata->>'contentKind' AS content_kind
        FROM feed_items f
        JOIN source_items s ON s.tenant_id=f.tenant_id AND s.workspace_id=f.workspace_id
          AND s.id=f.source_item_id AND s.provider_key=f.provider_key
        JOIN interests i ON i.tenant_id=f.tenant_id AND i.workspace_id=f.workspace_id AND i.id=f.interest_id
        LEFT JOIN source_item_engagement_snapshots e ON e.tenant_id=s.tenant_id
          AND e.workspace_id=s.workspace_id AND e.source_item_id=s.id AND e.provider_key=s.provider_key
        WHERE f.tenant_id=$1::uuid AND f.workspace_id=$2::uuid AND f.status='VISIBLE'
          AND f.provider_key <> 'github-trending-page'
          AND COALESCE(f.provider_metadata->>'kind','') <> 'github_trending_page_repository'
          AND ($3::uuid IS NULL OR f.interest_id=$3::uuid)
          AND f.published_at >= $4::timestamptz AND f.published_at < $5::timestamptz
          AND f.published_at <= clock_timestamp()
          AND s.created_at+interval '180 days'>clock_timestamp()
          AND EXISTS (SELECT 1 FROM source_bindings b JOIN source_catalog_entries c
            ON c.id=b.source_catalog_entry_id AND c.provider_key=f.provider_key
            WHERE b.tenant_id=f.tenant_id AND b.workspace_id=f.workspace_id AND b.id=f.source_binding_id
              AND b.interest_id=f.interest_id AND b.status='ENABLED' AND b.deleted_at IS NULL)
          AND i.status='ENABLED' AND i.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM workspaces w JOIN tenants t ON t.id=w.tenant_id
            WHERE w.id=f.workspace_id AND w.tenant_id=f.tenant_id AND w.deleted_at IS NULL AND t.deleted_at IS NULL)
          AND COALESCE(s.metadata->>'deleted','false') <> 'true'
          AND COALESCE(s.metadata->>'dead','false') <> 'true'
          AND COALESCE(s.metadata->>'banned','false') <> 'true'
          AND NOT EXISTS (SELECT 1 FROM feed_items revoked WHERE revoked.tenant_id=f.tenant_id
            AND revoked.workspace_id=f.workspace_id AND revoked.source_item_id=f.source_item_id
            AND revoked.interest_id=f.interest_id AND revoked.status='TOMBSTONED')
        ORDER BY f.id LIMIT $7::integer)
        SELECT id,source_item_id,provider_key,published_at,
          engagement_observed_at,interest_id,content_hash,content_kind,input_bytes,
          CASE WHEN input_bytes <= $6 THEN canonical_url ELSE '' END AS canonical_url,
          CASE WHEN input_bytes <= $6 THEN provider_metadata ELSE '{}'::jsonb END AS provider_metadata,
          CASE WHEN input_bytes <= $6 THEN title ELSE '' END AS title,
          CASE WHEN input_bytes <= $6 THEN body ELSE '' END AS body,
          CASE WHEN input_bytes <= $6 THEN LEFT(title,2000) ELSE '' END AS title_preview,
          CASE WHEN input_bytes <= $6 THEN LEFT(body,3200) ELSE '' END AS body_preview,
          CASE WHEN input_bytes <= $6 THEN interest_query ELSE '' END AS interest_query,
          CASE WHEN input_bytes <= $6 THEN source_metadata ELSE '{}'::jsonb END AS source_metadata
        FROM (SELECT visible.*,sum(source_bytes) OVER () AS input_bytes FROM visible) bounded`,
      window.tenantId, window.workspaceId, window.interestId ?? null,
      window.startedAt, window.endedAt, this.assessment.maxSourceBytes, READER_POST_CANDIDATE_BUDGET + 1);
      if (rows.length > READER_POST_CANDIDATE_BUDGET || rows.some(row => !Number.isSafeInteger(Number(row.input_bytes)) ||
          Number(row.input_bytes) > this.assessment.maxSourceBytes)) {
        throw new DomainError("operation.conflict", "Post window is too large; choose a shorter period");
      }
      const answers = new Map<string, { usefulness: string; relevance: string }>();
      // Rebuild in bounded batches; full request bodies never accumulate for the whole window.
      for (let offset = 0; offset < rows.length; offset += 100) {
        const prepared = new Map<string, ReaderPostAssessmentIdentity>();
        for (const row of rows.slice(offset, offset + 100)) {
          const source = { ...window, interestId: row.interest_id, sourceItemId: row.source_item_id,
            providerKey: row.provider_key, canonicalUrl: row.canonical_url, title: row.title, body: row.body,
            interest: row.interest_query, contentHash: row.content_hash,
            sourceMetadata: row.source_metadata ?? {}, providerMetadata: row.provider_metadata ?? {} };
          const current = this.assessment.prepare(source);
          if (current !== undefined) prepared.set(row.id, current);
        }
        const inputs = [...prepared].map(([id, input]) => ({ id, ...input }));
        // Only current identity fields cross the SQL boundary, never request bodies.
        const batch = inputs.map(input => ({
          id: input.id, interest_id: input.interestId, source_item_id: input.sourceItemId,
          source_revision_key: input.sourceRevisionKey, source_snapshot_sha256: input.sourceSnapshotSha256,
          interest_sha256: input.interestSha256, rubric_version: input.rubricVersion,
          rubric_sha256: input.rubricSha256, input_builder_version: input.inputBuilderVersion,
          model_config_version: input.modelConfigVersion, request_sha256: input.requestSha256,
        }));
        const matched = await tx.$queryRawUnsafe<{ id: string; input_sha256: string; result: unknown }[]>(`
          SELECT p.id::text,r.input_sha256,r.result FROM jsonb_to_recordset($3::jsonb) AS p(
            id uuid,interest_id uuid,source_item_id uuid,source_revision_key text,source_snapshot_sha256 text,
            interest_sha256 text,rubric_version text,rubric_sha256 text,input_builder_version text,
            model_config_version text,request_sha256 text)
          JOIN reader_value_assessments r ON r.tenant_id=$1::uuid AND r.workspace_id=$2::uuid
            AND r.interest_id=p.interest_id AND r.source_item_id=p.source_item_id
            AND r.source_revision_key=p.source_revision_key AND r.source_snapshot_sha256=p.source_snapshot_sha256
            AND r.interest_sha256=p.interest_sha256 AND r.rubric_version=p.rubric_version
            AND r.rubric_sha256=p.rubric_sha256 AND r.input_builder_version=p.input_builder_version
            AND r.model_config_version=p.model_config_version AND r.request_sha256=p.request_sha256
            AND r.state='assessed' AND r.expires_at>clock_timestamp()
          ORDER BY p.id,r.assessed_at DESC NULLS LAST,r.id`,
        window.tenantId, window.workspaceId, JSON.stringify(batch));
        for (const row of matched) {
          const input = prepared.get(row.id), result = validateReaderValueAnswers(row.result);
          if (!answers.has(row.id) && input !== undefined && result.ok && input.matchesInputSha256(row.input_sha256)) {
            answers.set(row.id, { usefulness: result.value.usefulness.choice, relevance: result.value.relevance.choice });
          }
        }
      }
      const posts = rows.flatMap((row) => {
        const safe = this.safety.evaluate({ providerKey: row.provider_key,
          title: row.title_preview, canonicalUrl: row.canonical_url, bodyPreview: row.body_preview });
        if (safe.status === "blocked" || !safe.sanitizedCanonicalUrl) return [];
        return [{ id: row.id, sourceItemId: row.source_item_id,
          providerKey: row.provider_key,
          providerFamily: readerPromotionSourceForProviderKey(row.provider_key)?.family ?? row.provider_key,
          title: safe.sanitizedTitle, bodyPreview: safe.sanitizedBodyPreview ?? "", canonicalUrl: safe.sanitizedCanonicalUrl,
          publishedAt: row.published_at, engagement: readerBrowseSourceEngagement({ providerKey: row.provider_key,
            providerMetadata: row.provider_metadata ?? undefined,
            engagementObservedAt: row.engagement_observed_at }),
          engagementObservedAt: row.engagement_observed_at,
          usefulness: answers.get(row.id)?.usefulness ?? null, relevance: answers.get(row.id)?.relevance ?? null,
          ...(row.content_kind === "quote"
            ? { quotedContext: "not_captured" as const } : {}) }];
      });
      // Select one projection per source only after current assessments match.
      const bySource = new Map<string, ReaderPost>();
      for (const post of posts.sort(bestAssessmentFirst)) if (!bySource.has(post.sourceItemId)) bySource.set(post.sourceItemId, post);
      return [...bySource.values()];
      });
    }, { isolationLevel: "Serializable", timeout: 10000, maxWait: 5000 });
  }
}


const bestAssessmentFirst = (left: ReaderPost, right: ReaderPost): number => {
  const rank = (labels: readonly string[], value: string | null) => {
    const index = value === null ? -1 : labels.indexOf(value); return index < 0 ? labels.length : index;
  };
  return rank(["central", "relevant", "adjacent", "unrelated"], left.relevance) -
    rank(["central", "relevant", "adjacent", "unrelated"], right.relevance) ||
    rank(["important", "useful", "context", "noise"], left.usefulness) -
    rank(["important", "useful", "context", "noise"], right.usefulness) || left.id.localeCompare(right.id);
};
