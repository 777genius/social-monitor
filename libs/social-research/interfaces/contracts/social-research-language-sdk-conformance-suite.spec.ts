import { buildSocialResearchLanguageSdkConformanceSuite } from './social-research-language-sdk-conformance-suite';
import { buildSocialResearchSdkCases } from './social-research-sdk-cases';
import { buildSocialResearchSdkConformance } from './social-research-sdk-conformance';

describe('buildSocialResearchLanguageSdkConformanceSuite', () => {
  it('classifies language SDK golden cases by executable runner mode', () => {
    const suite = buildSocialResearchLanguageSdkConformanceSuite();
    const sdkCases = buildSocialResearchSdkCases();

    expect(suite).toMatchObject({
      schemaVersion: 1,
      artifactId: 'social-research.language-sdk-conformance-suite.v1',
      sourceOfTruth: 'libs/social-research',
      runnerContract: {
        inputFormat: 'stable_json_contract_artifacts',
        outputFormat: 'stable_json_conformance_report',
        providerPolicy: 'no_provider_clients_or_credentials',
        comparisonPolicy: 'compare_json_values_not_snapshots_of_logs',
        reportValidator: 'validateSocialResearchLanguageSdkConformanceReport',
      },
      referenceReports: {
        typescript:
          'libs/contracts/social-research/social-research.typescript-sdk-conformance-report.json',
      },
      targetLanguages: ['typescript', 'python'],
    });
    expect(suite.caseChecks.map((item) => item.caseId)).toEqual(
      sdkCases.cases.map((item) => item.caseId),
    );
    expect(suite.caseGroups).toEqual({
      portableCaseIds: [
        'reddit_research_request_v1',
        'x_account_recall_request_v1',
        'ranking_quality_recipe_request_v1',
        'invalid_empty_topic_failure_v1',
      ],
      extensionStrategyCaseIds: ['mastodon_extension_request_v1'],
    });

    expect(suite.caseChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          caseId: 'reddit_research_request_v1',
          executionMode: 'portable_planner',
          requiredCapabilities: expect.arrayContaining([
            'json_request_input',
            'request_builder',
            'canonical_intent_compiler',
            'planner',
          ]),
        }),
        expect.objectContaining({
          caseId: 'mastodon_extension_request_v1',
          executionMode: 'extension_strategy_planner',
          requiredCapabilities: expect.arrayContaining([
            'custom_source_capability_profile',
            'custom_lane_strategy_hook',
            'account_lane_strategy_recipe',
          ]),
          expectedAssertions: expect.arrayContaining([
            'extension_profile_and_lane_strategy_recipe_supported',
          ]),
        }),
        expect.objectContaining({
          caseId: 'ranking_quality_recipe_request_v1',
          executionMode: 'portable_ranker',
          operationId: 'rankResults',
          safeOperationId: 'tryRankResults',
        }),
        expect.objectContaining({
          caseId: 'invalid_empty_topic_failure_v1',
          executionMode: 'portable_safe_failure',
          safeOperationId: 'trySearchRequest',
        }),
      ]),
    );
  });

  it('keeps operation checks aligned with SDK conformance metadata', () => {
    const suite = buildSocialResearchLanguageSdkConformanceSuite();
    const conformance = buildSocialResearchSdkConformance();

    expect(suite.operationChecks.map((item) => item.operationId)).toEqual(
      conformance.requiredOperations.map((item) => item.operationId),
    );
    expect(suite.operationChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          operationId: 'rankResults',
          executionContract: 'pure_in_process',
          targetLanguages: ['typescript', 'python'],
        }),
        expect.objectContaining({
          operationId: 'listSources',
          executionContract: 'pure_in_process',
          targetLanguages: ['typescript', 'python'],
        }),
        expect.objectContaining({
          operationId: 'explainSourceReadiness',
          executionContract: 'pure_in_process',
          targetLanguages: ['typescript', 'python'],
        }),
        expect.objectContaining({
          operationId: 'searchRequest',
          executionContract: 'transport_gateway_required',
          targetLanguages: ['typescript', 'python'],
        }),
      ]),
    );
  });
});
