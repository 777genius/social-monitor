import {
  buildSocialResearchLanguageSdkManifest,
  type SocialResearchLanguageSdkLanguage,
} from './social-research-language-sdk-manifest';
import {
  buildSocialResearchSdkCases,
  type SocialResearchSdkCase,
} from './social-research-sdk-cases';
import { buildSocialResearchSdkConformance } from './social-research-sdk-conformance';

export type SocialResearchLanguageSdkConformanceSuite = {
  readonly schemaVersion: 1;
  readonly artifactId: 'social-research.language-sdk-conformance-suite.v1';
  readonly generatedFrom: readonly string[];
  readonly sourceOfTruth: 'libs/social-research';
  readonly contractArtifacts: {
    readonly languageSdkManifest: 'libs/contracts/social-research/social-research.language-sdk-manifest.json';
    readonly goldenCases: 'libs/contracts/social-research/social-research.sdk-cases.json';
    readonly sdkConformance: 'libs/contracts/social-research/social-research.sdk-conformance.json';
  };
  readonly referenceReports: {
    readonly typescript: 'libs/contracts/social-research/social-research.typescript-sdk-conformance-report.json';
  };
  readonly runnerContract: {
    readonly inputFormat: 'stable_json_contract_artifacts';
    readonly outputFormat: 'stable_json_conformance_report';
    readonly providerPolicy: 'no_provider_clients_or_credentials';
    readonly comparisonPolicy: 'compare_json_values_not_snapshots_of_logs';
    readonly reportValidator: 'validateSocialResearchLanguageSdkConformanceReport';
  };
  readonly targetLanguages: readonly SocialResearchLanguageSdkLanguage[];
  readonly operationChecks: readonly SocialResearchLanguageSdkOperationCheck[];
  readonly caseChecks: readonly SocialResearchLanguageSdkCaseCheck[];
  readonly caseGroups: {
    readonly portableCaseIds: readonly string[];
    readonly extensionStrategyCaseIds: readonly string[];
  };
};

export type SocialResearchLanguageSdkOperationCheck = {
  readonly operationId: string;
  readonly safeOperationId?: string;
  readonly sideEffects: 'none' | 'provider_read';
  readonly executionContract: 'pure_in_process' | 'transport_gateway_required';
  readonly targetLanguages: readonly SocialResearchLanguageSdkLanguage[];
};

export type SocialResearchLanguageSdkCaseCheck = {
  readonly caseId: string;
  readonly sourceCaseKind: SocialResearchSdkCase['kind'];
  readonly operationId: string;
  readonly safeOperationId?: string;
  readonly executionMode:
    | 'portable_planner'
    | 'portable_ranker'
    | 'portable_safe_failure'
    | 'extension_strategy_planner';
  readonly requiredCapabilities: readonly SocialResearchLanguageSdkCaseCapability[];
  readonly expectedAssertions: readonly SocialResearchLanguageSdkCaseAssertion[];
  readonly targetLanguages: readonly SocialResearchLanguageSdkLanguage[];
};

export type SocialResearchLanguageSdkCaseCapability =
  | 'json_request_input'
  | 'request_builder'
  | 'canonical_intent_compiler'
  | 'planner'
  | 'ranker'
  | 'ranking_recipe'
  | 'quality_signals'
  | 'safe_failure_envelope'
  | 'custom_source_capability_profile'
  | 'custom_lane_strategy_hook'
  | 'account_lane_strategy_recipe';

export type SocialResearchLanguageSdkCaseAssertion =
  | 'request_input_normalizes_to_intent'
  | 'planner_output_matches_expected_plan'
  | 'explanation_matches_expected_text'
  | 'ranked_items_match_expected_order_and_signals'
  | 'safe_method_returns_failure_envelope'
  | 'extension_profile_and_lane_strategy_recipe_supported';

export const buildSocialResearchLanguageSdkConformanceSuite =
  (): SocialResearchLanguageSdkConformanceSuite => {
    const manifest = buildSocialResearchLanguageSdkManifest();
    const conformance = buildSocialResearchSdkConformance();
    const sdkCases = buildSocialResearchSdkCases();
    const targetLanguages = manifest.targets.map((target) => target.language);
    const caseChecks = sdkCases.cases.map((sdkCase) =>
      caseCheckFor(sdkCase, targetLanguages),
    );

    return {
      schemaVersion: 1,
      artifactId: 'social-research.language-sdk-conformance-suite.v1',
      generatedFrom: [
        'libs/social-research/interfaces/contracts/social-research-language-sdk-manifest.ts',
        'libs/social-research/interfaces/contracts/social-research-sdk-cases.ts',
        'libs/social-research/interfaces/contracts/social-research-sdk-conformance.ts',
      ],
      sourceOfTruth: 'libs/social-research',
      contractArtifacts: {
        languageSdkManifest:
          'libs/contracts/social-research/social-research.language-sdk-manifest.json',
        goldenCases:
          'libs/contracts/social-research/social-research.sdk-cases.json',
        sdkConformance:
          'libs/contracts/social-research/social-research.sdk-conformance.json',
      },
      referenceReports: {
        typescript:
          'libs/contracts/social-research/social-research.typescript-sdk-conformance-report.json',
      },
      runnerContract: {
        inputFormat: 'stable_json_contract_artifacts',
        outputFormat: 'stable_json_conformance_report',
        providerPolicy: 'no_provider_clients_or_credentials',
        comparisonPolicy: 'compare_json_values_not_snapshots_of_logs',
        reportValidator: 'validateSocialResearchLanguageSdkConformanceReport',
      },
      targetLanguages,
      operationChecks: conformance.requiredOperations.map((operation) => ({
        operationId: operation.operationId,
        ...(operation.safeOperationId === undefined
          ? {}
          : { safeOperationId: operation.safeOperationId }),
        sideEffects: operation.sideEffects,
        executionContract: operation.requiresGateway
          ? 'transport_gateway_required'
          : 'pure_in_process',
        targetLanguages,
      })),
      caseChecks,
      caseGroups: {
        portableCaseIds: caseChecks
          .filter((item) => item.executionMode !== 'extension_strategy_planner')
          .map((item) => item.caseId),
        extensionStrategyCaseIds: caseChecks
          .filter((item) => item.executionMode === 'extension_strategy_planner')
          .map((item) => item.caseId),
      },
    };
  };

const caseCheckFor = (
  sdkCase: SocialResearchSdkCase,
  targetLanguages: readonly SocialResearchLanguageSdkLanguage[],
): SocialResearchLanguageSdkCaseCheck => {
  if (sdkCase.kind === 'request_to_plan') {
    return {
      caseId: sdkCase.caseId,
      sourceCaseKind: sdkCase.kind,
      operationId: 'createSearchPlanFromRequest',
      executionMode: 'portable_planner',
      requiredCapabilities: [
        'json_request_input',
        'request_builder',
        'canonical_intent_compiler',
        'planner',
      ],
      expectedAssertions: [
        'request_input_normalizes_to_intent',
        'planner_output_matches_expected_plan',
        'explanation_matches_expected_text',
      ],
      targetLanguages,
    };
  }

  if (sdkCase.kind === 'source_extension_request_to_plan') {
    return {
      caseId: sdkCase.caseId,
      sourceCaseKind: sdkCase.kind,
      operationId: 'createSearchPlanFromRequest',
      executionMode: 'extension_strategy_planner',
      requiredCapabilities: [
        'json_request_input',
        'request_builder',
        'canonical_intent_compiler',
        'planner',
        'custom_source_capability_profile',
        'custom_lane_strategy_hook',
        'account_lane_strategy_recipe',
      ],
      expectedAssertions: [
        'request_input_normalizes_to_intent',
        'planner_output_matches_expected_plan',
        'explanation_matches_expected_text',
        'extension_profile_and_lane_strategy_recipe_supported',
      ],
      targetLanguages,
    };
  }

  if (sdkCase.kind === 'rank_results') {
    return {
      caseId: sdkCase.caseId,
      sourceCaseKind: sdkCase.kind,
      operationId: 'rankResults',
      safeOperationId: 'tryRankResults',
      executionMode: 'portable_ranker',
      requiredCapabilities: ['ranker', 'ranking_recipe', 'quality_signals'],
      expectedAssertions: ['ranked_items_match_expected_order_and_signals'],
      targetLanguages,
    };
  }

  return {
    caseId: sdkCase.caseId,
    sourceCaseKind: sdkCase.kind,
    operationId: 'searchRequest',
    safeOperationId: 'trySearchRequest',
    executionMode: 'portable_safe_failure',
    requiredCapabilities: [
      'json_request_input',
      'canonical_intent_compiler',
      'safe_failure_envelope',
    ],
    expectedAssertions: ['safe_method_returns_failure_envelope'],
    targetLanguages,
  };
};
