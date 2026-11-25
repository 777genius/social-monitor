import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { assessmentPostgresFixture, seedAssessmentSource } from './lib/reader-value-postgres-fixture';
import { PrismaReaderValueAssessmentStore } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-assessment-store';
import { PrismaReaderValueExistingAssessment } from '@social-monitor/relevance/infrastructure/reader-value/prisma-reader-value-existing-assessment';

async function main() {
  const fixture = await assessmentPostgresFixture();
  try {
    const { input } = await seedAssessmentSource(fixture.setup);
    const stored = await new PrismaReaderValueAssessmentStore(fixture.client).ensure(randomUUID(), input);
    assert(stored);
    const reader = new PrismaReaderValueExistingAssessment(fixture.client);
    assert.equal((await reader.find(input))?.id, stored.id);
    for (const key of ['sourceSnapshotSha256', 'inputSha256', 'rubricSha256',
      'modelConfigVersion', 'interestSha256', 'sourceRevisionKey', 'inputBuilderVersion',
      'rubricVersion', 'requestSha256'] as const) {
      assert.equal(await reader.find({ ...input, [key]: 'different' }), null, `${key} cannot reuse assessment`);
    }
    const foreign = await seedAssessmentSource(fixture.setup);
    assert.equal(await reader.find({ ...input, tenantId: foreign.input.tenantId,
      workspaceId: foreign.input.workspaceId }), null, 'foreign tenant cannot reuse assessment');
    assert.equal(await reader.find({ ...input, interestId: foreign.input.interestId }), null,
      'foreign interest cannot reuse assessment');
    const expiring = await seedAssessmentSource(fixture.setup);
    await fixture.setup.query("UPDATE source_items SET created_at=clock_timestamp()-interval '180 days'+interval '3 seconds' WHERE id=$1", [expiring.input.sourceItemId]);
    const expiringRow = await new PrismaReaderValueAssessmentStore(fixture.client).ensure(randomUUID(), expiring.input);
    assert(expiringRow);
    await new Promise((resolve) => setTimeout(resolve, 3500));
    assert.equal(await reader.find(expiring.input), null, 'expired assessment cannot qualify capture');
    assert.equal((await fixture.setup.query('SELECT attempts FROM reader_value_assessments WHERE id=$1', [stored.id])).rows[0].attempts, 0,
      'read-only qualification never dispatches model work');
    console.log(JSON.stringify({ check: 'reader-summary-jev-exact-lookup', passed: true,
      postgresFixtureOnly: true, currentIdentityChecks: 9, scopeChecks: 2, zeroDispatch: true }));
  } finally { await fixture.close(); }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
