import { isDeepStrictEqual } from 'node:util';

import { SocialResearchSdk } from '../../application/social-research-sdk';
import { createSocialSearchIntent } from '../../application/social-research-request';
import type { SocialSearchPlannerOptions } from '../../domain/policies/social-search-planner';
import { createAccountLaneStrategyFromRecipes } from '../../domain/policies/social-source-lane-recipes';
import {
  socialResearchAllPassed,
  socialResearchConformanceCount,
  type SocialResearchAssertionConformanceResult,
  type SocialResearchCaseConformanceResult,
  type SocialResearchConformanceStatus,
  type SocialResearchLanguageSdkConformanceReport,
} from './social-research-language-sdk-conformance-report';
import {
  buildSocialResearchLanguageSdkConformanceSuite,
  type SocialResearchLanguageSdkCaseAssertion,
} from './social-research-language-sdk-conformance-suite';
import {
  buildSocialResearchSdkCases,
  type SocialResearchSdkCase,
  type SocialResearchSourceExtensionPlanCase,
} from './social-research-sdk-cases';

export type SocialResearchTypescriptSdkConformanceReport =
  SocialResearchLanguageSdkConformanceReport & {
    readonly artifactId: 'social-research.typescript-sdk-conformance-report.v1';
    readonly targetLanguage: 'typescript';
  };

export const buildSocialResearchTypescriptSdkConformanceReport =
  async (): Promise<SocialResearchTypescriptSdkConformanceReport> => {
    const suite = buildSocialResearchLanguageSdkConformanceSuite();
    const sdkCases = buildSocialResearchSdkCases();
    const operationResults = suite.operationChecks.map((operation) => ({
      operationId: operation.operationId,
      ...(operation.safeOperationId === undefined
        ? {}
        : { safeOperationId: operation.safeOperationId }),
      status: operationStatus(operation),
    }));
    const caseResults = await Promise.all(
      sdkCases.cases.map((sdkCase) => executeCase(sdkCase)),
    );

    return {
      schemaVersion: 1,
      artifactId: 'social-research.typescript-sdk-conformance-report.v1',
      generatedFrom: [
        'libs/social-research/interfaces/contracts/social-research-language-sdk-conformance-suite.ts',
        'libs/social-research/interfaces/contracts/social-research-sdk-cases.ts',
        'libs/social-research/application/social-research-sdk.ts',
      ],
      sourceOfTruth: 'libs/social-research',
      targetLanguage: 'typescript',
      suiteArtifact:
        'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json',
      summary: {
        status: socialResearchAllPassed([...operationResults, ...caseResults]),
        operationChecks: socialResearchConformanceCount(operationResults),
        caseChecks: socialResearchConformanceCount(caseResults),
      },
      operationResults,
      caseResults,
    };
  };

const operationStatus = (operation: {
  readonly operationId: string;
  readonly safeOperationId?: string;
}): SocialResearchConformanceStatus => {
  const hasOperation =
    typeof Reflect.get(SocialResearchSdk.prototype, operation.operationId) ===
    'function';
  const hasSafeOperation =
    operation.safeOperationId === undefined ||
    typeof Reflect.get(
      SocialResearchSdk.prototype,
      operation.safeOperationId,
    ) === 'function';

  return hasOperation && hasSafeOperation ? 'passed' : 'failed';
};

const executeCase = async (
  sdkCase: SocialResearchSdkCase,
): Promise<SocialResearchCaseConformanceResult> => {
  const suiteCase =
    buildSocialResearchLanguageSdkConformanceSuite().caseChecks.find(
      (item) => item.caseId === sdkCase.caseId,
    );
  const assertionResults = await assertionResultsFor(sdkCase);

  return {
    caseId: sdkCase.caseId,
    executionMode: suiteCase?.executionMode ?? 'missing_suite_case',
    status: socialResearchAllPassed(assertionResults),
    assertionResults,
  };
};

const assertionResultsFor = async (
  sdkCase: SocialResearchSdkCase,
): Promise<readonly SocialResearchAssertionConformanceResult[]> => {
  if (sdkCase.kind === 'request_to_plan') {
    return plannerAssertionResults(sdkCase);
  }

  if (sdkCase.kind === 'source_extension_request_to_plan') {
    return plannerAssertionResults(
      sdkCase,
      extensionPlannerOptions(sdkCase),
    );
  }

  if (sdkCase.kind === 'rank_results') {
    return [
      assertionResult(
        'ranked_items_match_expected_order_and_signals',
        isDeepStrictEqual(
          new SocialResearchSdk().rankResults(sdkCase.rankInput),
          sdkCase.expectedRankedItems,
        ),
      ),
    ];
  }

  const result = await new SocialResearchSdk().trySearchRequest(
    sdkCase.requestInput,
  );

  return [
    assertionResult(
      'safe_method_returns_failure_envelope',
      !result.ok && isDeepStrictEqual(result.error, sdkCase.expectedFailure),
    ),
  ];
};

const plannerAssertionResults = (
  sdkCase:
    | Extract<SocialResearchSdkCase, { readonly kind: 'request_to_plan' }>
    | SocialResearchSourceExtensionPlanCase,
  options?: SocialSearchPlannerOptions,
): readonly SocialResearchAssertionConformanceResult[] => {
  const sdk = new SocialResearchSdk();
  const planResult = sdk.createSearchPlanFromRequest(
    sdkCase.requestInput,
    options,
  );
  const explanation =
    planResult.ok === false
      ? undefined
      : sdk.explainSearchRequest(sdkCase.requestInput, options);

  return [
    assertionResult(
      'request_input_normalizes_to_intent',
      isDeepStrictEqual(
        createSocialSearchIntent(sdkCase.requestInput),
        sdkCase.expectedIntent,
      ),
    ),
    assertionResult(
      'planner_output_matches_expected_plan',
      planResult.ok && isDeepStrictEqual(planResult.plan, sdkCase.expectedPlan),
    ),
    assertionResult(
      'explanation_matches_expected_text',
      explanation === sdkCase.expectedExplanation,
    ),
    ...(sdkCase.kind === 'source_extension_request_to_plan'
      ? [
          assertionResult(
            'extension_profile_and_lane_strategy_recipe_supported',
            sdkCase.sourceExtensionContract.laneStrategy.recipes.length > 0,
          ),
        ]
      : []),
  ];
};

const extensionPlannerOptions = (
  sdkCase: SocialResearchSourceExtensionPlanCase,
): SocialSearchPlannerOptions => ({
  sourceCapabilities: [sdkCase.sourceExtensionContract.capabilityProfile],
  additionalSourceLaneStrategies: [
    createAccountLaneStrategyFromRecipes({
      strategyId: sdkCase.sourceExtensionContract.laneStrategy.strategyId,
      sourceKey: sdkCase.sourceExtensionContract.sourceKey,
      recipes: sdkCase.sourceExtensionContract.laneStrategy.recipes,
    }),
  ],
});

const assertionResult = (
  assertion: SocialResearchLanguageSdkCaseAssertion,
  passed: boolean,
): SocialResearchAssertionConformanceResult => ({
  assertion,
  status: passed ? 'passed' : 'failed',
});
