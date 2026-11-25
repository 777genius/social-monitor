import { buildSocialResearchLanguageSdkConformanceSuite } from './social-research-language-sdk-conformance-suite';
import {
  buildSocialResearchLanguageSdkManifest,
  type SocialResearchLanguageSdkLanguage,
} from './social-research-language-sdk-manifest';

export type SocialResearchLanguageSdkRunnerContract = {
  readonly schemaVersion: 1;
  readonly artifactId: 'social-research.language-sdk-runner-contract.v1';
  readonly generatedFrom: readonly string[];
  readonly sourceOfTruth: 'libs/social-research';
  readonly contractArtifacts: {
    readonly languageSdkManifest: 'libs/contracts/social-research/social-research.language-sdk-manifest.json';
    readonly languageConformanceSuite: 'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json';
  };
  readonly runnerPolicy: {
    readonly inputFormat: 'stable_json_contract_artifacts';
    readonly outputFormat: 'stable_json_conformance_report';
    readonly reportValidator: 'validateSocialResearchLanguageSdkConformanceReport';
    readonly providerPolicy: 'no_provider_clients_or_credentials';
    readonly generatedReportActivationPolicy: 'report_artifact_required_before_target_is_conformance_ready';
  };
  readonly targets: readonly SocialResearchLanguageSdkRunnerTarget[];
};

export type SocialResearchLanguageSdkRunnerTarget = {
  readonly language: SocialResearchLanguageSdkLanguage;
  readonly packageName: string;
  readonly runnerStatus:
    | 'reference_report_ready'
    | 'contract_client_report_ready';
  readonly runnerKind:
    | 'typescript_reference_in_process'
    | 'generated_sdk_external_process';
  readonly reportArtifact: SocialResearchLanguageSdkReportArtifactPath;
  readonly requiredInputArtifacts: readonly SocialResearchLanguageSdkRunnerInputArtifact[];
  readonly reportValidator: 'validateSocialResearchLanguageSdkConformanceReport';
  readonly command: string;
  readonly activationCriteria: readonly string[];
};

export type SocialResearchLanguageSdkReportArtifactPath =
  | 'libs/contracts/social-research/social-research.typescript-sdk-conformance-report.json'
  | 'libs/contracts/social-research/social-research.python-sdk-conformance-report.json';

export type SocialResearchLanguageSdkRunnerInputArtifact =
  | 'libs/contracts/social-research/social-research.contract.json'
  | 'libs/contracts/social-research/social-research.sdk-cases.json'
  | 'libs/contracts/social-research/social-research.sdk-conformance.json'
  | 'libs/contracts/social-research/social-research.language-sdk-manifest.json'
  | 'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json';

export const buildSocialResearchLanguageSdkRunnerContract =
  (): SocialResearchLanguageSdkRunnerContract => {
    const manifest = buildSocialResearchLanguageSdkManifest();
    const suite = buildSocialResearchLanguageSdkConformanceSuite();
    const targetByLanguage = new Map(
      manifest.targets.map((target) => [target.language, target]),
    );

    return {
      schemaVersion: 1,
      artifactId: 'social-research.language-sdk-runner-contract.v1',
      generatedFrom: [
        'libs/social-research/interfaces/contracts/social-research-language-sdk-manifest.ts',
        'libs/social-research/interfaces/contracts/social-research-language-sdk-conformance-suite.ts',
        'libs/social-research/interfaces/contracts/social-research-language-sdk-conformance-report.ts',
      ],
      sourceOfTruth: 'libs/social-research',
      contractArtifacts: {
        languageSdkManifest:
          'libs/contracts/social-research/social-research.language-sdk-manifest.json',
        languageConformanceSuite:
          'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json',
      },
      runnerPolicy: {
        inputFormat: suite.runnerContract.inputFormat,
        outputFormat: suite.runnerContract.outputFormat,
        reportValidator: suite.runnerContract.reportValidator,
        providerPolicy: suite.runnerContract.providerPolicy,
        generatedReportActivationPolicy:
          'report_artifact_required_before_target_is_conformance_ready',
      },
      targets: suite.targetLanguages.map((language) =>
        runnerTargetFor(language, targetByLanguage.get(language)?.packageName),
      ),
    };
  };

const runnerTargetFor = (
  language: SocialResearchLanguageSdkLanguage,
  packageName: string | undefined,
): SocialResearchLanguageSdkRunnerTarget => {
  if (language === 'typescript') {
    return {
      language,
      packageName: packageName ?? '@social-monitor/social-research',
      runnerStatus: 'reference_report_ready',
      runnerKind: 'typescript_reference_in_process',
      reportArtifact:
        'libs/contracts/social-research/social-research.typescript-sdk-conformance-report.json',
      requiredInputArtifacts: requiredInputArtifacts,
      reportValidator: 'validateSocialResearchLanguageSdkConformanceReport',
      command: 'npm run check:social-research-contract',
      activationCriteria: [
        'buildSocialResearchTypescriptSdkConformanceReport emits a passed report',
        'validateSocialResearchLanguageSdkConformanceReport returns ok=true for the emitted report',
      ],
    };
  }

  return {
    language,
    packageName: packageName ?? 'social_monitor_social_research',
    runnerStatus: 'contract_client_report_ready',
    runnerKind: 'generated_sdk_external_process',
    reportArtifact:
      'libs/contracts/social-research/social-research.python-sdk-conformance-report.json',
    requiredInputArtifacts: requiredInputArtifacts,
    reportValidator: 'validateSocialResearchLanguageSdkConformanceReport',
    command: 'npm run check:social-research-python-sdk-conformance',
    activationCriteria: [
      'runner reads stable JSON contract artifacts instead of TypeScript source',
      'runner emits stable JSON conformance report at reportArtifact',
      'validateSocialResearchLanguageSdkConformanceReport returns ok=true for the emitted report',
      'runner report executes against the real Python SDK client and MCP adapter package',
    ],
  };
};

const requiredInputArtifacts: readonly SocialResearchLanguageSdkRunnerInputArtifact[] =
  [
    'libs/contracts/social-research/social-research.contract.json',
    'libs/contracts/social-research/social-research.sdk-cases.json',
    'libs/contracts/social-research/social-research.sdk-conformance.json',
    'libs/contracts/social-research/social-research.language-sdk-manifest.json',
    'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json',
  ];
