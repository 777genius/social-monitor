import { buildSocialResearchSdkConformance } from './social-research-sdk-conformance';

export type SocialResearchLanguageSdkManifest = {
  readonly schemaVersion: 1;
  readonly artifactId: 'social-research.language-sdk-manifest.v1';
  readonly generatedFrom: readonly string[];
  readonly sourceOfTruth: 'libs/social-research';
  readonly contractArtifacts: {
    readonly modelsAndOperations: 'libs/contracts/social-research/social-research.contract.json';
    readonly goldenCases: 'libs/contracts/social-research/social-research.sdk-cases.json';
    readonly sdkConformance: 'libs/contracts/social-research/social-research.sdk-conformance.json';
    readonly languageConformanceSuite: 'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json';
    readonly languageRunnerContract: 'libs/contracts/social-research/social-research.language-sdk-runner-contract.json';
  };
  readonly compatibilityPolicy: {
    readonly sourceKeys: 'open_string';
    readonly safeOperations: 'discriminated_result_envelope';
    readonly providerPayloads: 'not_exposed';
    readonly recipeTransport: 'serializable_recipe_json_only';
    readonly strategyCode: 'typescript_runtime_extension_only';
  };
  readonly recipeModels: readonly [
    'SocialAccountLaneStrategyRecipe',
    'SocialQueryStrategyRecipe',
    'SocialRankingRecipe',
    'SocialItemQualityRecipe',
  ];
  readonly ergonomicSurfaceContract: {
    readonly requestInputModel: 'SocialResearchRequestInput';
    readonly canonicalIntentModel: 'SocialSearchIntent';
    readonly builderClass: 'SocialResearchRequestBuilder';
    readonly builderFactory: 'createSocialResearchRequestBuilder';
    readonly builderPolicy: 'immutable_builder_outputs_serializable_request_json';
  };
  readonly targets: readonly SocialResearchLanguageSdkTarget[];
};

export type SocialResearchLanguageSdkTarget = {
  readonly language: SocialResearchLanguageSdkLanguage;
  readonly packageName: string;
  readonly status: 'reference_implementation' | 'generated_contract_ready';
  readonly artifactRole: 'source_of_truth_sdk' | 'generated_sdk';
  readonly preferredTransports: readonly SocialResearchLanguageSdkTransport[];
  readonly requiredOperationIds: readonly string[];
  readonly requiredSafeOperationIds: readonly string[];
  readonly requiredModelNames: readonly string[];
  readonly requiredGoldenCaseIds: readonly string[];
  readonly requiredErgonomicSurfaces: readonly SocialResearchErgonomicSurface[];
  readonly executableGates: readonly string[];
};

export type SocialResearchLanguageSdkLanguage =
  | 'typescript'
  | 'python';

export type SocialResearchLanguageSdkTransport =
  | 'in_process'
  | 'rest'
  | 'grpc';

export type SocialResearchErgonomicSurface =
  | 'json_request_input'
  | 'request_builder';

export const buildSocialResearchLanguageSdkManifest =
  (): SocialResearchLanguageSdkManifest => {
    const conformance = buildSocialResearchSdkConformance();
    const requiredOperationIds = conformance.requiredOperations.map(
      (operation) => operation.operationId,
    );
    const requiredSafeOperationIds = conformance.requiredOperations.flatMap(
      (operation) =>
        operation.safeOperationId === undefined
          ? []
          : [operation.safeOperationId],
    );
    const baseTarget = {
      requiredOperationIds,
      requiredSafeOperationIds,
      requiredModelNames: conformance.requiredModels,
      requiredGoldenCaseIds: conformance.goldenCaseIds,
      requiredErgonomicSurfaces: [
        'json_request_input',
        'request_builder',
      ] as const,
    };

    return {
      schemaVersion: 1,
      artifactId: 'social-research.language-sdk-manifest.v1',
      generatedFrom: [
        'libs/social-research/interfaces/contracts/social-research-model-schemas.ts',
        'libs/social-research/interfaces/contracts/social-research-sdk-cases.ts',
        'libs/social-research/interfaces/contracts/social-research-sdk-conformance.ts',
      ],
      sourceOfTruth: 'libs/social-research',
      contractArtifacts: {
        modelsAndOperations:
          'libs/contracts/social-research/social-research.contract.json',
        goldenCases:
          'libs/contracts/social-research/social-research.sdk-cases.json',
        sdkConformance:
          'libs/contracts/social-research/social-research.sdk-conformance.json',
        languageConformanceSuite:
          'libs/contracts/social-research/social-research.language-sdk-conformance-suite.json',
        languageRunnerContract:
          'libs/contracts/social-research/social-research.language-sdk-runner-contract.json',
      },
      compatibilityPolicy: {
        sourceKeys: conformance.sourceExtensionContract.sourceKeyModel,
        safeOperations: 'discriminated_result_envelope',
        providerPayloads: conformance.serialization.providerPayloads,
        recipeTransport: 'serializable_recipe_json_only',
        strategyCode: 'typescript_runtime_extension_only',
      },
      recipeModels: [
        conformance.sourceExtensionContract.strategyRecipeModel,
        conformance.queryStrategyContract.recipeModel,
        conformance.rankingContract.recipeModel,
        conformance.rankingContract.qualityRecipeModel,
      ],
      ergonomicSurfaceContract: {
        requestInputModel: 'SocialResearchRequestInput',
        canonicalIntentModel: 'SocialSearchIntent',
        builderClass: 'SocialResearchRequestBuilder',
        builderFactory: 'createSocialResearchRequestBuilder',
        builderPolicy: 'immutable_builder_outputs_serializable_request_json',
      },
      targets: [
        {
          language: 'typescript',
          packageName: '@social-monitor/social-research',
          status: 'reference_implementation',
          artifactRole: 'source_of_truth_sdk',
          preferredTransports: ['in_process'],
          executableGates: [
            'npx jest libs/social-research/application/social-research-sdk.spec.ts --runInBand',
            'npm run check:social-research-sdk-conformance',
          ],
          ...baseTarget,
        },
        {
          language: 'python',
          packageName: 'social_monitor_social_research',
          status: 'generated_contract_ready',
          artifactRole: 'generated_sdk',
          preferredTransports: ['rest', 'grpc'],
          executableGates: [
            'npm run check:social-research-contract',
            'npm run check:social-research-sdk-conformance',
          ],
          ...baseTarget,
        },
      ],
    };
  };
