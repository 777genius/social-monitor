import { validateSocialResearchLanguageSdkConformanceReport } from './social-research-language-sdk-conformance-report';
import { buildSocialResearchLanguageSdkConformanceSuite } from './social-research-language-sdk-conformance-suite';
import { buildSocialResearchTypescriptSdkConformanceReport } from './social-research-typescript-sdk-conformance-report';

describe('buildSocialResearchTypescriptSdkConformanceReport', () => {
  it('executes the language SDK conformance suite against the TypeScript SDK', async () => {
    const suite = buildSocialResearchLanguageSdkConformanceSuite();
    const report = await buildSocialResearchTypescriptSdkConformanceReport();

    expect(report).toMatchObject({
      schemaVersion: 1,
      artifactId: 'social-research.typescript-sdk-conformance-report.v1',
      sourceOfTruth: 'libs/social-research',
      targetLanguage: 'typescript',
      suiteArtifact:
        'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json',
      summary: {
        status: 'passed',
        operationChecks: {
          passed: 11,
          total: 11,
        },
        caseChecks: {
          passed: 5,
          total: 5,
        },
      },
    });
    expect(report.operationResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationId: 'searchRequest',
          safeOperationId: 'trySearchRequest',
          status: 'passed',
        }),
        expect.objectContaining({
          operationId: 'rankResults',
          safeOperationId: 'tryRankResults',
          status: 'passed',
        }),
        expect.objectContaining({
          operationId: 'listSources',
          status: 'passed',
        }),
        expect.objectContaining({
          operationId: 'explainSourceReadiness',
          safeOperationId: 'tryExplainSourceReadiness',
          status: 'passed',
        }),
      ]),
    );
    expect(report.caseResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caseId: 'mastodon_extension_request_v1',
          executionMode: 'extension_strategy_planner',
          status: 'passed',
        }),
        expect.objectContaining({
          caseId: 'ranking_quality_recipe_request_v1',
          executionMode: 'portable_ranker',
          status: 'passed',
        }),
      ]),
    );
    expect(
      validateSocialResearchLanguageSdkConformanceReport({
        report,
        suite,
        targetLanguage: 'typescript',
      }).ok,
    ).toBe(true);
  });
});
