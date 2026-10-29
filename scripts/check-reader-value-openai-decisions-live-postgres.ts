import assert from 'node:assert/strict';
import { assessmentPostgresFixture } from './lib/reader-value-postgres-fixture';
import { checkReaderValueProviderPipeline } from './lib/reader-value-provider-pipeline-postgres';
import { boundedPipelineTransport, providerPipelineFailureCode,
  reportProviderPipelineFailure } from './lib/reader-value-provider-pipeline-fixture';

async function main() {
  const check = 'reader-value-openai-decisions-live-postgres';
  if (process.env.READER_VALUE_OPENAI_DECISIONS_LIVE !== 'true') {
    console.error(JSON.stringify({ check, passed: false, errorCode: 'explicit_live_opt_in_required' }));
    process.exitCode = 1;
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    console.error(JSON.stringify({ check, passed: false, errorCode: 'selected_openai_key_required' }));
    process.exitCode = 1;
    return;
  }
  // The fixture independently rejects nonlocal/non-assessment_test_admin URLs.
  const fixture = await assessmentPostgresFixture();
  const bounded = boundedPipelineTransport(fetch, 4);
  try {
    const evidence = [];
    for (const sourceKind of ['useful', 'unrelated'] as const) {
      evidence.push(await checkReaderValueProviderPipeline(fixture, 'openai-decisions', {
        apiKey, transport: bounded.transport, calls: bounded.calls, sourceKind,
      }));
    }
    assert.equal(bounded.calls(), 2, 'two sources each spend one normal request');
    assert.equal(bounded.blockedCalls(), 0);
    console.log(JSON.stringify({ check, passed: true, externalHttp: true,
      productionPrismaConnection: true, partialMigrationFixture: true, requestCeiling: 4,
      transportCalls: bounded.calls(), reuseCallDelta: 0, evidence,
      admittedIds: evidence.flatMap((item) => item.admittedIds),
      excludedIds: evidence.flatMap((item) => item.excludedIds),
      finalSummaryWritingVerified: false }));
  } catch (error: unknown) {
    console.error(JSON.stringify({ check, passed: false, transportCalls: bounded.calls(),
      blockedCalls: bounded.blockedCalls(), errorCode: providerPipelineFailureCode(error) }));
    process.exitCode = 1;
  } finally { await fixture.close(); }
}

void main().catch((error: unknown) => reportProviderPipelineFailure('reader-value-openai-decisions-live-postgres', error));
