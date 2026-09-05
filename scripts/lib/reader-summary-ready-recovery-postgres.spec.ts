import { readFileSync } from 'node:fs';
import { recoveryFixtureSchema } from './reader-summary-ready-recovery-postgres-fixture';
import { withReaderDeliveryPostgresFixture } from './reader-summary-ready-delivery-postgres-fixture';

// Wiring/guard checks supplement the native gate; these are not PG evidence.
describe('native recovery fixture contract', () => {
  const original = process.env.READER_DELIVERY_TEST_ADMIN_DATABASE_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.READER_DELIVERY_TEST_ADMIN_DATABASE_URL;
    else process.env.READER_DELIVERY_TEST_ADMIN_DATABASE_URL = original;
  });
  it.each([undefined, 'postgresql://fixture:fixture@remote.invalid/test',
    'postgresql://fixture:fixture@127.0.0.1/test?host=remote.invalid'])('fails closed before connecting for %s', async url => {
    if (url === undefined) delete process.env.READER_DELIVERY_TEST_ADMIN_DATABASE_URL;
    else process.env.READER_DELIVERY_TEST_ADMIN_DATABASE_URL = url;
    const operation = jest.fn();
    await expect(withReaderDeliveryPostgresFixture(operation)).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
  });
  it('extracts complete native tables, constraints, and indexes from source migrations', () => {
    const statements = recoveryFixtureSchema();
    expect(statements.filter(sql => sql.startsWith('CREATE TABLE'))).toHaveLength(5);
    const source = statements.join('\n');
    for (const expected of ['TIMESTAMPTZ(6)', 'reader_summary_publications_outbox_key',
      'reader_summary_weekly_publication_evidence_slot_fkey', 'reader_summary_weekly_publication_evidence_semantics_check']) {
      expect(source).toContain(expected);
    }
  });
  it('registers a bounded native executable with no skip/fallback', () => {
    const config = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(config.scripts['check:reader-summary-ready-recovery-postgres']).toContain('--timeout-ms 120000');
    expect(config.scripts['check:reader-summary-ready-recovery-postgres']).toContain('scripts/check-reader-summary-ready-recovery-postgres.ts');
  });
});
