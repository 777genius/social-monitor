import { PrismaReaderValueInventory } from './prisma-reader-value-inventory';
import type { AssessmentSqlClient, AssessmentSqlTransaction } from './assessment-sql';
import { classifyReaderValueSourceKind } from '../../domain/reader-value/reader-value-source-kind';
import { ReaderValueInventoryByteCeilingExceeded } from
  '../../application/contracts/reader-value-inventory';

const scope = {tenantId:'11111111-1111-4111-8111-111111111111',
  workspaceId:'22222222-2222-4222-8222-222222222222',
  interestId:'44444444-4444-4444-8444-444444444444'};
describe('Prisma reader-value inventory JSON boundary', () => {
  it.each([null,42,'legacy',[],true])('maps malformed source/feed metadata to unsupported kinds and preserves the next row', async (providerMetadata) => {
    const source = {published_at:'2026-09-10 00:00:00.000001+00',
      observed_at:'2026-09-10 00:00:01.2+00:00',interest_id:'interest',source_item_id:'source',
      provider_key:'rss',canonical_url:'https://example.test/article',title:'Method',body:'Measured results',
      query:'Methods',content_hash:'revision',source_updated_at:'2026-09-09 23:59:59.000001+00:00',
      metadata:{kind:'rss_item'}};
    const rows = [{...source,feed_item_id:'first',provider_metadata:providerMetadata},
      {...source,feed_item_id:'second',metadata:providerMetadata,provider_metadata:{kind:'rss_item'}},
      {...source,feed_item_id:'third',provider_metadata:{kind:'rss_item'}}];
    const inventorySql: string[] = [];
    let queryIndex = 0;
    const identities = rows.map((row) => ({feed_item_id:row.feed_item_id,
      source_item_id:row.source_item_id,source_updated_at:row.source_updated_at,
      content_hash:row.content_hash,
      source_bytes:Buffer.byteLength(row.title)+Buffer.byteLength(row.body)}));
    const tx: AssessmentSqlTransaction = {
      $executeRawUnsafe:async () => 0,
      $queryRawUnsafe:async <T>(sql: string) => { inventorySql.push(sql);
        return (queryIndex++ === 0 ? identities : rows) as T; },
    };
    const client: AssessmentSqlClient = {...tx,$transaction:async (operation) => operation(tx)};
    const page = await new PrismaReaderValueInventory(client).page(scope,'2026-09-01T00:00:00Z',undefined,25,
      undefined,'2026-09-11T00:00:00.000000Z');
    expect(page).toHaveLength(3);
    expect(classifyReaderValueSourceKind(page[0]!.source.providerKey,page[0]!.metadata).supported).toBe(false);
    expect(classifyReaderValueSourceKind(page[1]!.source.providerKey,page[1]!.metadata).supported).toBe(false);
    expect(classifyReaderValueSourceKind(page[2]!.source.providerKey,page[2]!.metadata).supported).toBe(true);
    expect(page.map((row) => row.cursor.feedItemId)).toEqual(['first','second','third']);
    expect(page[0]?.cursor.publishedAt).toBe('2026-09-10T00:00:00.000001Z');
    expect(page[0]?.observedAt).toBe('2026-09-10T00:00:01.200000Z');
    expect(page[0]?.sourceUpdatedAt).toBe('2026-09-09T23:59:59.000001Z');
    expect(inventorySql).toHaveLength(2);
    expect(inventorySql[0]).toContain('octet_length(s.title)+octet_length(s.body)');
    expect(inventorySql[0]).not.toContain('s.title,s.body');
    expect(inventorySql[0]).toContain('f.published_at < $8::timestamptz');
    expect(inventorySql[1]).toContain('jsonb_to_recordset');
    expect(inventorySql[1]).toContain('f.published_at < $8::timestamptz');
    expect(inventorySql[1]).toContain('s.content_updated_at=r.source_updated_at');
    expect(inventorySql.join('\n')).toContain('s.content_updated_at::text AS source_updated_at');
    expect(inventorySql.join('\n')).toContain('s.content_updated_at IS NOT NULL');
    expect(inventorySql.join('\n')).not.toContain('s.updated_at');
  });

  it('rejects over-ceiling identities before selecting full source bodies', async () => {
    const queries: string[] = [];
    const tx: AssessmentSqlTransaction = {
      $executeRawUnsafe:async () => 0,
      $queryRawUnsafe:async <T>(sql: string) => { queries.push(sql); return [{
        feed_item_id:'first',source_item_id:'source',
        source_updated_at:'2026-09-09 23:59:59+00',content_hash:'revision',
        source_bytes:32 * 1024 * 1024 + 1,
      }] as T; },
    };
    const client: AssessmentSqlClient = {...tx,$transaction:async (operation) => operation(tx)};

    await expect(new PrismaReaderValueInventory(client).page(
      scope,'2026-09-01T00:00:00Z',undefined,25,
    )).rejects.toBeInstanceOf(ReaderValueInventoryByteCeilingExceeded);
    expect(queries).toHaveLength(1);
    expect(queries[0]).not.toContain('s.title,s.body');
  });
});
