/** Pure archived-observation planning. Native admission and fresh absence are separate. */
import { createHash } from 'node:crypto';
import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type { FetchedSourceItem } from '@social-monitor/ingestion/ports';
import { normalizeGitHubTrendingArchivedBoard } from '@social-monitor/ingestion/adapters/source/github-trending-page/github-trending-archive-normalizer';
import { sanitizeFetchedSourceItem } from '@social-monitor/ingestion/features/execute-scan/scan-source-sanitization';
import type { GitHubTrendingArchiveProvenance } from '@social-monitor/ingestion/domain/value-objects/github-trending-archive';

export type GitHubArchiveScope = Readonly<{ tenantId: TenantId; workspaceId: WorkspaceId;
  interestId: string; sourceBindingId: string; scanPolicyId: string }>;
export type GitHubArchiveCandidate = Readonly<{ externalId: string; item: FetchedSourceItem }>;
export type GitHubArchivePlan = Readonly<{ schemaVersion: 1; day: string;
  coverage: 'PARTIAL_ARCHIVED_OBSERVATIONS'; providerKey: 'github-trending-page';
  sourceQuery: Readonly<{mode:'listing';query:string}>; scope: GitHubArchiveScope;
  archiveSha256: string; qualifiedSha256: string; bindingConfig: string; bindingConfigSha256: string;
  itemsSha256: string; selectedCount: number; candidates: readonly GitHubArchiveCandidate[]; planSha256: string }>;
export type GitHubArchivePlannerInput = Readonly<{ bytes: Buffer; archive: GitHubTrendingArchiveProvenance;
  scope: GitHubArchiveScope; bindingConfig: string; expectedBindingConfigSha256: string;
  sourceQuery: GitHubArchivePlan['sourceQuery']; missingRepositoryNames: readonly string[];
  /** Immutable operator packet pins scope, source custody and selected absence snapshot. */
  qualifiedSha256: string }>;
const digest=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
function need(ok:unknown,reason:string):asserts ok {if(!ok)throw new Error(reason);}

export function planGitHubArchiveQualifiedPartition(input:GitHubArchivePlannerInput) {
  need(Object.values(input.scope).every(id=>uuid.test(id)),'Archived GitHub scope must be explicit');
  need(/^[a-f0-9]{64}$/u.test(input.qualifiedSha256) &&
    digest(input.bindingConfig)===input.expectedBindingConfigSha256,'Archived GitHub packet/config pin mismatch');
  need(input.sourceQuery.mode==='listing'&&['daily','today'].includes(input.sourceQuery.query),
    'Archived GitHub daily binding required');
  const config:unknown=JSON.parse(input.bindingConfig);
  need(config!==null&&typeof config==='object'&&!Array.isArray(config),'Archived GitHub config required');
  const c=config as Record<string,unknown>;
  need(c.mode===input.sourceQuery.mode&&c.query===input.sourceQuery.query,'Archived GitHub query/config mismatch');
  const missing=new Set(input.missingRepositoryNames.map(name=>name.toLowerCase()));
  need(missing.size===input.missingRepositoryNames.length&&missing.size>=1&&missing.size<=10,
    'Archived GitHub missing selection must be unique and bounded');
  // Canonical Top 10 is computed BEFORE missing-only selection; never promote rank 11.
  const canonical=normalizeGitHubTrendingArchivedBoard(input);
  const candidates=canonical.filter(item=>missing.has(item.canonicalUrl.slice('https://github.com/'.length).toLowerCase()))
    .map(item=>({externalId:item.externalId,item}));
  need(candidates.length===missing.size,'Archived GitHub missing selection is outside canonical Top 10');
  need(candidates.every(candidate=>JSON.stringify(sanitizeFetchedSourceItem(candidate.item))===JSON.stringify(candidate.item)),
    'Archived GitHub item would change during canonical sanitization');
  const day=input.archive.serializedAt.slice(0,10);
  const unsigned={schemaVersion:1 as const,day,coverage:'PARTIAL_ARCHIVED_OBSERVATIONS' as const,
    providerKey:'github-trending-page' as const,sourceQuery:input.sourceQuery,scope:input.scope,
    archiveSha256:input.archive.fileSha256,qualifiedSha256:input.qualifiedSha256,
    bindingConfig:input.bindingConfig,bindingConfigSha256:input.expectedBindingConfigSha256,
    itemsSha256:digest(JSON.stringify(candidates)),selectedCount:candidates.length,candidates};
  const plan:GitHubArchivePlan={...unsigned,planSha256:digest(JSON.stringify(unsigned))};
  const semanticKey=digest(JSON.stringify({archive:input.archive.fileSha256,scope:input.scope,day,
    selectedIds:candidates.map(item=>item.externalId).sort()}));
  return {semanticKey,plan,journalFilename:'github-archive-qualified-'+semanticKey+'.journal.json',
    productionAuthority:'NONE' as const};
}
