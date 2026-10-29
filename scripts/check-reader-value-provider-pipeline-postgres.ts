import assert from 'node:assert/strict';
import { assessmentPostgresFixture } from './lib/reader-value-postgres-fixture';
import { checkPersistedProviderRefusal, checkReaderValueProviderPipeline } from './lib/reader-value-provider-pipeline-postgres';
import { boundedPipelineTransport, reportProviderPipelineFailure,
  syntheticProviderResponse } from './lib/reader-value-provider-pipeline-fixture';

async function main() {
  const fixture = await assessmentPostgresFixture();
  try {
    const evidence = [];
    for (const provider of ['openrouter-systemone', 'openai-decisions'] as const) {
      const bounded = boundedPipelineTransport(async () => new Response(
        JSON.stringify(syntheticProviderResponse(provider)),
        { headers: { 'x-request-id': 'fixture-pipeline-request' } }), 1);
      evidence.push(await checkReaderValueProviderPipeline(fixture, provider, {
        transport: bounded.transport, calls: bounded.calls, apiKey: 'fixture-key', expectAdmitted: true,
      }));
      assert.equal(bounded.calls(), 1);
      assert.equal(bounded.blockedCalls(), 0);
    }
    const refusal = await checkPersistedProviderRefusal(fixture);
    console.log(JSON.stringify({ check: 'reader-value-provider-pipeline-postgres', passed: true,
      externalHttp: false, productionPrismaConnection: true, partialMigrationFixture: true,
      evidence, refusal }));
  } finally { await fixture.close(); }
}

void main().catch((error: unknown) => reportProviderPipelineFailure('reader-value-provider-pipeline-postgres', error));
