import type {
  SocialResearchLanguageSdkCaseAssertion,
  SocialResearchLanguageSdkConformanceSuite,
} from './social-research-language-sdk-conformance-suite';
import type { SocialResearchLanguageSdkLanguage } from './social-research-language-sdk-manifest';

export type SocialResearchLanguageSdkConformanceReport = {
  readonly schemaVersion: 1;
  readonly artifactId: SocialResearchLanguageSdkReportArtifactId;
  readonly generatedFrom: readonly string[];
  readonly sourceOfTruth: 'libs/social-research';
  readonly targetLanguage: SocialResearchLanguageSdkLanguage;
  readonly suiteArtifact: 'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json';
  readonly summary: {
    readonly status: SocialResearchConformanceStatus;
    readonly operationChecks: SocialResearchConformanceCount;
    readonly caseChecks: SocialResearchConformanceCount;
  };
  readonly operationResults: readonly SocialResearchOperationConformanceResult[];
  readonly caseResults: readonly SocialResearchCaseConformanceResult[];
};

export type SocialResearchLanguageSdkReportArtifactId =
  | 'social-research.typescript-sdk-conformance-report.v1'
  | 'social-research.python-sdk-conformance-report.v1';

export type SocialResearchConformanceStatus = 'passed' | 'failed';

export type SocialResearchConformanceCount = {
  readonly passed: number;
  readonly total: number;
};

export type SocialResearchOperationConformanceResult = {
  readonly operationId: string;
  readonly safeOperationId?: string;
  readonly status: SocialResearchConformanceStatus;
};

export type SocialResearchCaseConformanceResult = {
  readonly caseId: string;
  readonly executionMode: string;
  readonly status: SocialResearchConformanceStatus;
  readonly assertionResults: readonly SocialResearchAssertionConformanceResult[];
};

export type SocialResearchAssertionConformanceResult = {
  readonly assertion: SocialResearchLanguageSdkCaseAssertion;
  readonly status: SocialResearchConformanceStatus;
};

export type SocialResearchLanguageSdkReportValidation = {
  readonly ok: boolean;
  readonly violations: readonly string[];
};

export const validateSocialResearchLanguageSdkConformanceReport = (params: {
  readonly report: SocialResearchLanguageSdkConformanceReport;
  readonly suite: SocialResearchLanguageSdkConformanceSuite;
  readonly targetLanguage: SocialResearchLanguageSdkLanguage;
}): SocialResearchLanguageSdkReportValidation => {
  const violations: string[] = [];
  const expectedArtifactId =
    `social-research.${params.targetLanguage}-sdk-conformance-report.v1`;

  assertEqual(
    violations,
    params.report.schemaVersion,
    1,
    'report.schemaVersion',
  );
  assertEqual(
    violations,
    params.report.artifactId,
    expectedArtifactId,
    'report.artifactId',
  );
  assertEqual(
    violations,
    params.report.sourceOfTruth,
    'libs/social-research',
    'report.sourceOfTruth',
  );
  assertEqual(
    violations,
    params.report.targetLanguage,
    params.targetLanguage,
    'report.targetLanguage',
  );
  assertEqual(
    violations,
    params.report.suiteArtifact,
    'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json',
    'report.suiteArtifact',
  );

  if (!params.suite.targetLanguages.includes(params.targetLanguage)) {
    violations.push(
      `suite.targetLanguages does not include ${params.targetLanguage}`,
    );
  }

  validateOperationResults(violations, params);
  validateCaseResults(violations, params);
  validateSummary(violations, params.report);

  return {
    ok: violations.length === 0,
    violations,
  };
};

export const socialResearchConformanceCount = (
  results: readonly { readonly status: SocialResearchConformanceStatus }[],
): SocialResearchConformanceCount => ({
  passed: results.filter((result) => result.status === 'passed').length,
  total: results.length,
});

export const socialResearchAllPassed = (
  results: readonly { readonly status: SocialResearchConformanceStatus }[],
): SocialResearchConformanceStatus =>
  results.every((result) => result.status === 'passed') ? 'passed' : 'failed';

const validateOperationResults = (
  violations: string[],
  params: {
    readonly report: SocialResearchLanguageSdkConformanceReport;
    readonly suite: SocialResearchLanguageSdkConformanceSuite;
  },
): void => {
  assertArrayEqual(
    violations,
    params.report.operationResults.map((item) => item.operationId),
    params.suite.operationChecks.map((item) => item.operationId),
    'report.operationResults.operationId',
  );

  for (const [index, operation] of params.suite.operationChecks.entries()) {
    const result = params.report.operationResults[index];
    assertEqual(
      violations,
      result?.safeOperationId,
      operation.safeOperationId,
      `${operation.operationId}.safeOperationId`,
    );
  }
};

const validateCaseResults = (
  violations: string[],
  params: {
    readonly report: SocialResearchLanguageSdkConformanceReport;
    readonly suite: SocialResearchLanguageSdkConformanceSuite;
  },
): void => {
  assertArrayEqual(
    violations,
    params.report.caseResults.map((item) => item.caseId),
    params.suite.caseChecks.map((item) => item.caseId),
    'report.caseResults.caseId',
  );

  for (const [index, suiteCase] of params.suite.caseChecks.entries()) {
    const result = params.report.caseResults[index];
    assertEqual(
      violations,
      result?.executionMode,
      suiteCase.executionMode,
      `${suiteCase.caseId}.executionMode`,
    );
    assertArrayEqual(
      violations,
      result?.assertionResults.map((item) => item.assertion) ?? [],
      suiteCase.expectedAssertions,
      `${suiteCase.caseId}.assertions`,
    );
    assertEqual(
      violations,
      result?.status,
      socialResearchAllPassed(result?.assertionResults ?? []),
      `${suiteCase.caseId}.status`,
    );
  }
};

const validateSummary = (
  violations: string[],
  report: SocialResearchLanguageSdkConformanceReport,
): void => {
  assertEqual(
    violations,
    report.summary.operationChecks.total,
    report.operationResults.length,
    'report.summary.operationChecks.total',
  );
  assertEqual(
    violations,
    report.summary.operationChecks.passed,
    socialResearchConformanceCount(report.operationResults).passed,
    'report.summary.operationChecks.passed',
  );
  assertEqual(
    violations,
    report.summary.caseChecks.total,
    report.caseResults.length,
    'report.summary.caseChecks.total',
  );
  assertEqual(
    violations,
    report.summary.caseChecks.passed,
    socialResearchConformanceCount(report.caseResults).passed,
    'report.summary.caseChecks.passed',
  );
  assertEqual(
    violations,
    report.summary.status,
    socialResearchAllPassed([
      ...report.operationResults,
      ...report.caseResults,
    ]),
    'report.summary.status',
  );
};

const assertEqual = <T>(
  violations: string[],
  actual: T,
  expected: T,
  label: string,
): void => {
  if (actual !== expected) {
    violations.push(`${label} expected ${String(expected)}, got ${String(actual)}`);
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
