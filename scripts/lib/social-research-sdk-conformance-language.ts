import { existsSync, readFileSync } from 'node:fs';

import {
  buildSocialResearchLanguageSdkConformanceSuite,
  buildSocialResearchLanguageSdkManifest,
  buildSocialResearchLanguageSdkRunnerContract,
  validateSocialResearchLanguageSdkConformanceReport,
  type SocialResearchLanguageSdkConformanceReport,
  type SocialResearchSdkCaseSet,
  type SocialResearchSdkConformance,
  type SocialResearchTypescriptSdkConformanceReport,
} from '@social-monitor/social-research/contracts';

export const checkSocialResearchLanguageSdkConformance = (params: {
  readonly conformance: SocialResearchSdkConformance;
  readonly sdkCases: SocialResearchSdkCaseSet;
}): readonly string[] => {
  const violations: string[] = [];
  const languageSdkManifest = buildSocialResearchLanguageSdkManifest();
  const languageSdkConformanceSuite =
    buildSocialResearchLanguageSdkConformanceSuite();
  const languageSdkRunnerContract = buildSocialResearchLanguageSdkRunnerContract();
  const typescriptSdkConformanceReport = readTypescriptReport();
  const pythonSdkConformanceReport = readPythonReport();

  assertEqual(
    violations,
    params.conformance.contractArtifacts.languageSdkManifest,
    'libs/contracts/social-research/social-research.language-sdk-manifest.json',
    'conformance.contractArtifacts.languageSdkManifest',
  );
  assertEqual(
    violations,
    languageSdkManifest.contractArtifacts.sdkConformance,
    'libs/contracts/social-research/social-research.sdk-conformance.json',
    'languageSdkManifest.contractArtifacts.sdkConformance',
  );
  assertArrayEqual(
    violations,
    languageSdkManifest.recipeModels,
    [
      'SocialAccountLaneStrategyRecipe',
      'SocialQueryStrategyRecipe',
      'SocialRankingRecipe',
      'SocialItemQualityRecipe',
    ],
    'languageSdkManifest.recipeModels',
  );
  assertObjectKeys(
    violations,
    Object.fromEntries(
      languageSdkManifest.targets.map((target) => [target.language, target]),
    ),
    ['python', 'typescript'],
    'languageSdkManifest.targets',
  );
  assertEqual(
    violations,
    languageSdkManifest.ergonomicSurfaceContract.builderFactory,
    'createSocialResearchRequestBuilder',
    'languageSdkManifest.ergonomicSurfaceContract.builderFactory',
  );

  const requiredOperationIds = params.conformance.requiredOperations.map(
    (operation) => operation.operationId,
  );
  const requiredSafeOperationIds = params.conformance.requiredOperations.flatMap(
    (operation) =>
      operation.safeOperationId === undefined ? [] : [operation.safeOperationId],
  );
  for (const target of languageSdkManifest.targets) {
    assertArrayEqual(
      violations,
      target.requiredOperationIds,
      requiredOperationIds,
      `${target.language} requiredOperationIds`,
    );
    assertArrayEqual(
      violations,
      target.requiredSafeOperationIds,
      requiredSafeOperationIds,
      `${target.language} requiredSafeOperationIds`,
    );
    assertArrayEqual(
      violations,
      target.requiredModelNames,
      params.conformance.requiredModels,
      `${target.language} requiredModelNames`,
    );
    assertArrayEqual(
      violations,
      target.requiredGoldenCaseIds,
      params.conformance.goldenCaseIds,
      `${target.language} requiredGoldenCaseIds`,
    );
    assertArrayEqual(
      violations,
      target.requiredErgonomicSurfaces,
      ['json_request_input', 'request_builder'],
      `${target.language} requiredErgonomicSurfaces`,
    );
  }

  const typescriptTarget = languageSdkManifest.targets.find(
    (target) => target.language === 'typescript',
  );
  const pythonTarget = languageSdkManifest.targets.find(
    (target) => target.language === 'python',
  );
  assertEqual(
    violations,
    typescriptTarget?.status,
    'reference_implementation',
    'typescript target status',
  );
  assertArrayEqual(
    violations,
    typescriptTarget?.preferredTransports ?? [],
    ['in_process'],
    'typescript target preferredTransports',
  );
  assertEqual(
    violations,
    pythonTarget?.status,
    'generated_contract_ready',
    'python target status',
  );

  assertLanguageSdkConformanceSuite({
    violations,
    conformance: params.conformance,
    sdkCases: params.sdkCases,
    languageSdkManifest,
    languageSdkConformanceSuite,
  });
  assertLanguageSdkRunnerContract({
    violations,
    conformance: params.conformance,
    languageSdkManifest,
    languageSdkConformanceSuite,
    languageSdkRunnerContract,
  });
  assertTypescriptSdkConformanceReport({
    violations,
    conformance: params.conformance,
    sdkCases: params.sdkCases,
    languageSdkConformanceSuite,
    typescriptSdkConformanceReport,
  });
  assertPythonSdkConformanceReport({
    violations,
    conformance: params.conformance,
    sdkCases: params.sdkCases,
    languageSdkConformanceSuite,
    pythonSdkConformanceReport,
  });

  return violations;
};

const assertLanguageSdkRunnerContract = (params: {
  readonly violations: string[];
  readonly conformance: SocialResearchSdkConformance;
  readonly languageSdkManifest: ReturnType<
    typeof buildSocialResearchLanguageSdkManifest
  >;
  readonly languageSdkConformanceSuite: ReturnType<
    typeof buildSocialResearchLanguageSdkConformanceSuite
  >;
  readonly languageSdkRunnerContract: ReturnType<
    typeof buildSocialResearchLanguageSdkRunnerContract
  >;
}): void => {
  assertEqual(
    params.violations,
    params.conformance.contractArtifacts.languageSdkRunnerContract,
    'libs/contracts/social-research/social-research.language-sdk-runner-contract.json',
    'conformance.contractArtifacts.languageSdkRunnerContract',
  );
  assertEqual(
    params.violations,
    params.languageSdkManifest.contractArtifacts.languageRunnerContract,
    'libs/contracts/social-research/social-research.language-sdk-runner-contract.json',
    'languageSdkManifest.contractArtifacts.languageRunnerContract',
  );
  assertEqual(
    params.violations,
    params.languageSdkRunnerContract.runnerPolicy.reportValidator,
    'validateSocialResearchLanguageSdkConformanceReport',
    'languageSdkRunnerContract.runnerPolicy.reportValidator',
  );
  assertEqual(
    params.violations,
    params.languageSdkRunnerContract.runnerPolicy.generatedReportActivationPolicy,
    'report_artifact_required_before_target_is_conformance_ready',
    'languageSdkRunnerContract.runnerPolicy.generatedReportActivationPolicy',
  );
  assertArrayEqual(
    params.violations,
    params.languageSdkRunnerContract.targets.map((target) => target.language),
    params.languageSdkConformanceSuite.targetLanguages,
    'languageSdkRunnerContract.targets',
  );
  assertArrayEqual(
    params.violations,
    params.languageSdkRunnerContract.targets.map((target) => target.packageName),
    params.languageSdkManifest.targets.map((target) => target.packageName),
    'languageSdkRunnerContract.packageNames',
  );

  const targetByLanguage = new Map(
    params.languageSdkRunnerContract.targets.map((target) => [
      target.language,
      target,
    ]),
  );
  assertEqual(
    params.violations,
    targetByLanguage.get('typescript')?.runnerStatus,
    'reference_report_ready',
    'typescript runnerStatus',
  );
  assertEqual(
    params.violations,
    targetByLanguage.get('python')?.runnerStatus,
    'contract_client_report_ready',
    'python runnerStatus',
  );
  assertEqual(
    params.violations,
    targetByLanguage.get('typescript')?.reportArtifact,
    params.languageSdkConformanceSuite.referenceReports.typescript,
    'typescript reportArtifact',
  );
  assertEqual(
    params.violations,
    targetByLanguage.get('python')?.reportArtifact,
    'libs/contracts/social-research/social-research.python-sdk-conformance-report.json',
    'python reportArtifact',
  );
  assertEqual(
    params.violations,
    targetByLanguage.get('python')?.command,
    'npm run check:social-research-python-sdk-conformance',
    'python runner command',
  );
  assertFileExists(
    params.violations,
    'scripts/social_research_python_sdk_conformance.py',
    'python runner script',
  );
  assertEqual(
    params.violations,
    readPackageScripts()['check:social-research-python-sdk-conformance'],
    'python3 scripts/social_research_python_sdk_conformance.py',
    'package script check:social-research-python-sdk-conformance',
  );
  assertEqual(
    params.violations,
    readPackageScripts()['check:social-research-python-sdk'],
    "PYTHONPATH=libs/social-research/python python3 -m unittest discover -s libs/social-research/python/tests -p 'test_*.py'",
    'package script check:social-research-python-sdk',
  );
};

const assertLanguageSdkConformanceSuite = (params: {
  readonly violations: string[];
  readonly conformance: SocialResearchSdkConformance;
  readonly sdkCases: SocialResearchSdkCaseSet;
  readonly languageSdkManifest: ReturnType<
    typeof buildSocialResearchLanguageSdkManifest
  >;
  readonly languageSdkConformanceSuite: ReturnType<
    typeof buildSocialResearchLanguageSdkConformanceSuite
  >;
}): void => {
  assertEqual(
    params.violations,
    params.conformance.contractArtifacts.languageSdkConformanceSuite,
    'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json',
    'conformance.contractArtifacts.languageSdkConformanceSuite',
  );
  assertEqual(
    params.violations,
    params.languageSdkManifest.contractArtifacts.languageConformanceSuite,
    'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json',
    'languageSdkManifest.contractArtifacts.languageConformanceSuite',
  );
  assertEqual(
    params.violations,
    params.languageSdkConformanceSuite.runnerContract.providerPolicy,
    'no_provider_clients_or_credentials',
    'languageSdkConformanceSuite.runnerContract.providerPolicy',
  );
  assertArrayEqual(
    params.violations,
    params.languageSdkConformanceSuite.targetLanguages,
    ['typescript', 'python'],
    'languageSdkConformanceSuite.targetLanguages',
  );
  assertArrayEqual(
    params.violations,
    params.languageSdkConformanceSuite.operationChecks.map(
      (item) => item.operationId,
    ),
    params.conformance.requiredOperations.map((item) => item.operationId),
    'languageSdkConformanceSuite.operationChecks',
  );
  assertArrayEqual(
    params.violations,
    params.languageSdkConformanceSuite.caseChecks.map((item) => item.caseId),
    params.sdkCases.cases.map((item) => item.caseId),
    'languageSdkConformanceSuite.caseChecks',
  );
  assertArrayEqual(
    params.violations,
    params.languageSdkConformanceSuite.caseGroups.portableCaseIds,
    [
      'reddit_research_request_v1',
      'x_account_recall_request_v1',
      'ranking_quality_recipe_request_v1',
      'invalid_empty_topic_failure_v1',
    ],
    'languageSdkConformanceSuite.caseGroups.portableCaseIds',
  );
  assertArrayEqual(
    params.violations,
    params.languageSdkConformanceSuite.caseGroups.extensionStrategyCaseIds,
    ['mastodon_extension_request_v1'],
    'languageSdkConformanceSuite.caseGroups.extensionStrategyCaseIds',
  );

  const extensionCase = params.languageSdkConformanceSuite.caseChecks.find(
    (item) => item.caseId === 'mastodon_extension_request_v1',
  );
  assertEqual(
    params.violations,
    extensionCase?.executionMode,
    'extension_strategy_planner',
    'mastodon_extension_request_v1 executionMode',
  );
  for (const capability of [
    'custom_source_capability_profile',
    'custom_lane_strategy_hook',
    'account_lane_strategy_recipe',
  ] as const) {
    if (!extensionCase?.requiredCapabilities.includes(capability)) {
      params.violations.push(
        `mastodon_extension_request_v1 requiredCapabilities missing ${capability}`,
      );
    }
  }
};

const assertTypescriptSdkConformanceReport = (params: {
  readonly violations: string[];
  readonly conformance: SocialResearchSdkConformance;
  readonly sdkCases: SocialResearchSdkCaseSet;
  readonly languageSdkConformanceSuite: ReturnType<
    typeof buildSocialResearchLanguageSdkConformanceSuite
  >;
  readonly typescriptSdkConformanceReport: SocialResearchTypescriptSdkConformanceReport;
}): void => {
  assertEqual(
    params.violations,
    params.conformance.contractArtifacts.typescriptSdkConformanceReport,
    'libs/contracts/social-research/social-research.typescript-sdk-conformance-report.json',
    'conformance.contractArtifacts.typescriptSdkConformanceReport',
  );
  assertEqual(
    params.violations,
    params.languageSdkConformanceSuite.referenceReports.typescript,
    'libs/contracts/social-research/social-research.typescript-sdk-conformance-report.json',
    'languageSdkConformanceSuite.referenceReports.typescript',
  );
  assertEqual(
    params.violations,
    params.languageSdkConformanceSuite.runnerContract.reportValidator,
    'validateSocialResearchLanguageSdkConformanceReport',
    'languageSdkConformanceSuite.runnerContract.reportValidator',
  );
  const validation = validateSocialResearchLanguageSdkConformanceReport({
    report: params.typescriptSdkConformanceReport,
    suite: params.languageSdkConformanceSuite,
    targetLanguage: 'typescript',
  });
  for (const violation of validation.violations) {
    params.violations.push(
      `TypeScript SDK report validation failed: ${violation}`,
    );
  }
  assertEqual(
    params.violations,
    params.typescriptSdkConformanceReport.summary.status,
    'passed',
    'typescriptSdkConformanceReport.summary.status',
  );
  assertEqual(
    params.violations,
    params.typescriptSdkConformanceReport.summary.operationChecks.total,
    params.languageSdkConformanceSuite.operationChecks.length,
    'typescriptSdkConformanceReport.summary.operationChecks.total',
  );
  assertEqual(
    params.violations,
    params.typescriptSdkConformanceReport.summary.caseChecks.total,
    params.languageSdkConformanceSuite.caseChecks.length,
    'typescriptSdkConformanceReport.summary.caseChecks.total',
  );
  assertArrayEqual(
    params.violations,
    params.typescriptSdkConformanceReport.caseResults.map(
      (item) => item.caseId,
    ),
    params.sdkCases.cases.map((item) => item.caseId),
    'typescriptSdkConformanceReport.caseResults',
  );

  const failedResults = [
    ...params.typescriptSdkConformanceReport.operationResults,
    ...params.typescriptSdkConformanceReport.caseResults,
  ].filter((item) => item.status !== 'passed');
  for (const result of failedResults) {
    params.violations.push(
      `TypeScript SDK conformance failed: ${result.status}`,
    );
  }
};

const assertPythonSdkConformanceReport = (params: {
  readonly violations: string[];
  readonly conformance: SocialResearchSdkConformance;
  readonly sdkCases: SocialResearchSdkCaseSet;
  readonly languageSdkConformanceSuite: ReturnType<
    typeof buildSocialResearchLanguageSdkConformanceSuite
  >;
  readonly pythonSdkConformanceReport: SocialResearchLanguageSdkConformanceReport;
}): void => {
  assertEqual(
    params.violations,
    params.conformance.contractArtifacts.pythonSdkConformanceReport,
    'libs/contracts/social-research/social-research.python-sdk-conformance-report.json',
    'conformance.contractArtifacts.pythonSdkConformanceReport',
  );
  const validation = validateSocialResearchLanguageSdkConformanceReport({
    report: params.pythonSdkConformanceReport,
    suite: params.languageSdkConformanceSuite,
    targetLanguage: 'python',
  });
  for (const violation of validation.violations) {
    params.violations.push(`Python SDK report validation failed: ${violation}`);
  }
  assertEqual(
    params.violations,
    params.pythonSdkConformanceReport.summary.status,
    'passed',
    'pythonSdkConformanceReport.summary.status',
  );
  assertEqual(
    params.violations,
    params.pythonSdkConformanceReport.summary.operationChecks.total,
    params.languageSdkConformanceSuite.operationChecks.length,
    'pythonSdkConformanceReport.summary.operationChecks.total',
  );
  assertEqual(
    params.violations,
    params.pythonSdkConformanceReport.summary.caseChecks.total,
    params.languageSdkConformanceSuite.caseChecks.length,
    'pythonSdkConformanceReport.summary.caseChecks.total',
  );
  assertArrayEqual(
    params.violations,
    params.pythonSdkConformanceReport.caseResults.map((item) => item.caseId),
    params.sdkCases.cases.map((item) => item.caseId),
    'pythonSdkConformanceReport.caseResults',
  );

  const failedResults = [
    ...params.pythonSdkConformanceReport.operationResults,
    ...params.pythonSdkConformanceReport.caseResults,
  ].filter((item) => item.status !== 'passed');
  for (const result of failedResults) {
    params.violations.push(`Python SDK conformance failed: ${result.status}`);
  }
};

const readTypescriptReport = (): SocialResearchTypescriptSdkConformanceReport =>
  JSON.parse(
    readFileSync(
      'libs/contracts/social-research/social-research.typescript-sdk-conformance-report.json',
      'utf8',
    ),
  ) as SocialResearchTypescriptSdkConformanceReport;

const readPythonReport = (): SocialResearchLanguageSdkConformanceReport =>
  JSON.parse(
    readFileSync(
      'libs/contracts/social-research/social-research.python-sdk-conformance-report.json',
      'utf8',
    ),
  ) as SocialResearchLanguageSdkConformanceReport;

const readPackageScripts = (): Record<string, string> => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    readonly scripts?: Record<string, string>;
  };
  return packageJson.scripts ?? {};
};

const assertEqual = <TValue>(
  violations: string[],
  actual: TValue,
  expected: TValue,
  label: string,
): void => {
  if (actual !== expected) {
    violations.push(
      `${label} expected ${String(expected)}, got ${String(actual)}`,
    );
  }
};

const assertArrayEqual = (
  violations: string[],
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void => {
  if (
    actual.length !== expected.length ||
    actual.some((item, index) => item !== expected[index])
  ) {
    violations.push(
      `${label} expected [${expected.join(', ')}], got [${actual.join(', ')}]`,
    );
  }
};

const assertObjectKeys = (
  violations: string[],
  object: Record<string, unknown>,
  expectedKeys: readonly string[],
  label: string,
): void => {
  assertArrayEqual(
    violations,
    Object.keys(object).sort(),
    [...expectedKeys].sort(),
    label,
  );
};

const assertFileExists = (
  violations: string[],
  path: string,
  label: string,
): void => {
  if (!existsSync(path)) {
    violations.push(`${label} is missing at ${path}`);
  }
};
