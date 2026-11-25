import {
  buildSocialResearchModelJsonSchemas,
  socialResearchSdkOperationDefinitions,
  type SocialResearchSdkOperationDefinition,
} from './social-research-model-schemas';
import { socialResearchSourceVocabulary } from './social-research-source-vocabulary';
import {
  buildSocialSourceRegistry,
  type SocialSourceRegistryEntry,
} from '../../domain/value-objects/social-source-registry';
import { buildSocialResearchToolJsonSchemas } from '../tools/social-research-tool-json-schemas';
import { socialResearchToolDefinitions } from '../tools/social-research-tool-schemas';

export type SocialResearchContractTool = {
  readonly name: string;
  readonly description: string;
  readonly handlerMethod: string;
  readonly sdkOperationId: string;
  readonly requiresExecutionScope: boolean;
  readonly sideEffects: 'none' | 'provider_read';
  readonly inputSchema: Readonly<Record<string, unknown>>;
};

export type SocialResearchContractModel = {
  readonly name: string;
  readonly schema: Readonly<Record<string, unknown>>;
};

export type SocialResearchContract = {
  readonly schemaVersion: 1;
  readonly contractId: 'social-research.v1';
  readonly generatedFrom: readonly string[];
  readonly sdkArchitecture: {
    readonly sourceOfTruth: 'libs/social-research';
    readonly transports: readonly ['sdk', 'mcp', 'rest', 'grpc'];
    readonly mcpPolicy: 'thin_adapter';
    readonly grpcInputPolicy: 'typed_sdk_request_fields_with_json_fallback';
    readonly providerExecutionBoundary: 'SourceFetcherPort';
    readonly executionScopeRequiredFor: readonly ['search_social', 'fetch_thread'];
    readonly publicEntryPoints: {
      readonly core: '@social-monitor/social-research';
      readonly cache: '@social-monitor/social-research/cache';
      readonly contracts: '@social-monitor/social-research/contracts';
      readonly grpc: '@social-monitor/social-research/grpc';
      readonly ingestion: '@social-monitor/social-research/ingestion';
      readonly mcp: '@social-monitor/social-research/mcp';
      readonly rest: '@social-monitor/social-research/rest';
      readonly tools: '@social-monitor/social-research/tools';
    };
  };
  readonly serialization: {
    readonly dateTime: 'iso_8601_utc_string';
    readonly providerPayloads: 'not_exposed';
  };
  readonly sourceVocabulary: typeof socialResearchSourceVocabulary;
  readonly sourceRegistry: readonly SocialSourceRegistryEntry[];
  readonly models: readonly SocialResearchContractModel[];
  readonly sdkOperations: readonly SocialResearchSdkOperationDefinition[];
  readonly tools: readonly SocialResearchContractTool[];
};

export const buildSocialResearchContract = (): SocialResearchContract => {
  const schemas = buildSocialResearchToolJsonSchemas();
  const modelSchemas = buildSocialResearchModelJsonSchemas();

  return {
    schemaVersion: 1,
    contractId: 'social-research.v1',
    generatedFrom: [
      'libs/social-research/interfaces/tools/social-research-tool-schemas.ts',
      'libs/social-research/interfaces/tools/social-research-tool-json-schemas.ts',
      'libs/social-research/interfaces/contracts/social-research-model-schemas.ts',
      'libs/social-research/interfaces/contracts/social-research-plan-model-schemas.ts',
      'libs/social-research/interfaces/contracts/social-research-source-discovery-model-schemas.ts',
      'libs/social-research/interfaces/contracts/social-research-source-registry-model-schemas.ts',
      'libs/social-research/interfaces/contracts/social-research-source-vocabulary.ts',
      'libs/social-research/application/social-source-discovery.ts',
      'libs/social-research/domain/value-objects/social-source-registry.ts',
    ],
    sdkArchitecture: {
      sourceOfTruth: 'libs/social-research',
      transports: ['sdk', 'mcp', 'rest', 'grpc'],
      mcpPolicy: 'thin_adapter',
      grpcInputPolicy: 'typed_sdk_request_fields_with_json_fallback',
      providerExecutionBoundary: 'SourceFetcherPort',
      executionScopeRequiredFor: ['search_social', 'fetch_thread'],
      publicEntryPoints: {
        core: '@social-monitor/social-research',
        cache: '@social-monitor/social-research/cache',
        contracts: '@social-monitor/social-research/contracts',
        grpc: '@social-monitor/social-research/grpc',
        ingestion: '@social-monitor/social-research/ingestion',
        mcp: '@social-monitor/social-research/mcp',
        rest: '@social-monitor/social-research/rest',
        tools: '@social-monitor/social-research/tools',
      },
    },
    serialization: {
      dateTime: 'iso_8601_utc_string',
      providerPayloads: 'not_exposed',
    },
    sourceVocabulary: socialResearchSourceVocabulary,
    sourceRegistry: buildSocialSourceRegistry(),
    models: Object.entries(modelSchemas).map(([name, schema]) => ({
      name,
      schema,
    })),
    sdkOperations: socialResearchSdkOperationDefinitions,
    tools: socialResearchToolDefinitions.map((definition) => ({
      name: definition.name,
      description: definition.description,
      handlerMethod: definition.handlerMethod,
      sdkOperationId: definition.sdkOperationId,
      requiresExecutionScope: definition.requiresExecutionScope,
      sideEffects: definition.sideEffects,
      inputSchema: schemas[definition.name] ?? {},
    })),
  };
};
