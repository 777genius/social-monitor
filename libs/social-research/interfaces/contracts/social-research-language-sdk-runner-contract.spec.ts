import { buildSocialResearchLanguageSdkConformanceSuite } from './social-research-language-sdk-conformance-suite';
import { buildSocialResearchLanguageSdkManifest } from './social-research-language-sdk-manifest';
import { buildSocialResearchLanguageSdkRunnerContract } from './social-research-language-sdk-runner-contract';

describe('buildSocialResearchLanguageSdkRunnerContract', () => {
  it('declares report runner contracts for each language SDK target', () => {
    const manifest = buildSocialResearchLanguageSdkManifest();
    const suite = buildSocialResearchLanguageSdkConformanceSuite();
    const runnerContract = buildSocialResearchLanguageSdkRunnerContract();

    expect(runnerContract).toMatchObject({
      schemaVersion: 1,
      artifactId: 'social-research.language-sdk-runner-contract.v1',
      sourceOfTruth: 'libs/social-research',
      contractArtifacts: {
        languageSdkManifest:
          'libs/contracts/social-research/social-research.language-sdk-manifest.json',
        languageConformanceSuite:
          'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json',
      },
      runnerPolicy: {
        inputFormat: 'stable_json_contract_artifacts',
        outputFormat: 'stable_json_conformance_report',
        reportValidator: 'validateSocialResearchLanguageSdkConformanceReport',
        providerPolicy: 'no_provider_clients_or_credentials',
        generatedReportActivationPolicy:
          'report_artifact_required_before_target_is_conformance_ready',
      },
    });
    expect(runnerContract.targets.map((target) => target.language)).toEqual(
      suite.targetLanguages,
    );
    expect(runnerContract.targets.map((target) => target.packageName)).toEqual(
      manifest.targets.map((target) => target.packageName),
    );
  });

  it('declares generated SDK runners only after their report artifacts exist', () => {
    const runnerContract = buildSocialResearchLanguageSdkRunnerContract();

    expect(runnerContract.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          language: 'typescript',
          runnerStatus: 'reference_report_ready',
          runnerKind: 'typescript_reference_in_process',
          reportArtifact:
            'libs/contracts/social-research/social-research.typescript-sdk-conformance-report.json',
          command: 'npm run check:social-research-contract',
        }),
        expect.objectContaining({
          language: 'python',
          runnerStatus: 'contract_client_report_ready',
          runnerKind: 'generated_sdk_external_process',
          reportArtifact:
            'libs/contracts/social-research/social-research.python-sdk-conformance-report.json',
          command: 'npm run check:social-research-python-sdk-conformance',
        }),
      ]),
    );

    for (const target of runnerContract.targets) {
      expect(target.requiredInputArtifacts).toEqual([
        'libs/contracts/social-research/social-research.contract.json',
        'libs/contracts/social-research/social-research.sdk-cases.json',
        'libs/contracts/social-research/social-research.sdk-conformance.json',
        'libs/contracts/social-research/social-research.language-sdk-manifest.json',
        'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json',
      ]);
      expect(target.reportValidator).toBe(
        'validateSocialResearchLanguageSdkConformanceReport',
      );
      expect(target.activationCriteria).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'validateSocialResearchLanguageSdkConformanceReport returns ok=true',
          ),
        ]),
      );
    }
  });
});
