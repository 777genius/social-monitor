import { buildSocialResearchLanguageSdkManifest } from './social-research-language-sdk-manifest';
import { buildSocialResearchSdkConformance } from './social-research-sdk-conformance';

describe('buildSocialResearchLanguageSdkManifest', () => {
  it('declares SDK targets with shared conformance coverage', () => {
    const manifest = buildSocialResearchLanguageSdkManifest();
    const conformance = buildSocialResearchSdkConformance();
    const operationIds = conformance.requiredOperations.map(
      (operation) => operation.operationId,
    );
    const safeOperationIds = conformance.requiredOperations.flatMap(
      (operation) =>
        operation.safeOperationId === undefined
          ? []
          : [operation.safeOperationId],
    );

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      artifactId: 'social-research.language-sdk-manifest.v1',
      sourceOfTruth: 'libs/social-research',
      contractArtifacts: {
        sdkConformance:
          'libs/contracts/social-research/social-research.sdk-conformance.json',
        languageConformanceSuite:
          'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json',
        languageRunnerContract:
          'libs/contracts/social-research/social-research.language-sdk-runner-contract.json',
      },
      compatibilityPolicy: {
        sourceKeys: 'open_string',
        safeOperations: 'discriminated_result_envelope',
        providerPayloads: 'not_exposed',
        recipeTransport: 'serializable_recipe_json_only',
        strategyCode: 'typescript_runtime_extension_only',
      },
      recipeModels: [
        'SocialAccountLaneStrategyRecipe',
        'SocialQueryStrategyRecipe',
        'SocialRankingRecipe',
        'SocialItemQualityRecipe',
      ],
      ergonomicSurfaceContract: {
        requestInputModel: 'SocialResearchRequestInput',
        canonicalIntentModel: 'SocialSearchIntent',
        builderClass: 'SocialResearchRequestBuilder',
        builderFactory: 'createSocialResearchRequestBuilder',
        builderPolicy: 'immutable_builder_outputs_serializable_request_json',
      },
    });
    expect(manifest.targets.map((target) => target.language).sort()).toEqual([
      'python',
      'typescript',
    ]);

    for (const target of manifest.targets) {
      expect(target.requiredOperationIds).toEqual(operationIds);
      expect(target.requiredSafeOperationIds).toEqual(safeOperationIds);
      expect(target.requiredModelNames).toEqual(conformance.requiredModels);
      expect(target.requiredGoldenCaseIds).toEqual(
        conformance.goldenCaseIds,
      );
      expect(target.requiredGoldenCaseIds).toContain(
        'ranking_quality_recipe_request_v1',
      );
      expect(target.requiredErgonomicSurfaces).toEqual([
        'json_request_input',
        'request_builder',
      ]);
    }
  });

  it('keeps generated SDK targets transport-backed and TypeScript in-process', () => {
    const manifest = buildSocialResearchLanguageSdkManifest();

    expect(manifest.targets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          language: 'typescript',
          status: 'reference_implementation',
          artifactRole: 'source_of_truth_sdk',
          preferredTransports: ['in_process'],
        }),
        expect.objectContaining({
          language: 'python',
          status: 'generated_contract_ready',
          artifactRole: 'generated_sdk',
          preferredTransports: ['rest', 'grpc'],
        }),
      ]),
    );
  });
});
