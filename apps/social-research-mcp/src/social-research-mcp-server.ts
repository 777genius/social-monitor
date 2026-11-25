import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SourceFetcherPort } from '@social-monitor/ingestion/ports';

import {
  type SocialResearchExecutionPolicyPort,
  type SocialResearchExecutionScope,
  type SocialResearchGateway,
  type SocialResearchResultCachePort,
  type SocialThreadReaderPort,
} from '@social-monitor/social-research';
import {
  createDefaultSourceFetcherLaneExecutionCompiler,
  SourceFetcherSocialResearchGateway,
  type SourceFetcherLaneExecutionCompiler,
  SourceFetcherSocialThreadReader,
} from '@social-monitor/social-research/ingestion';
import { registerSocialResearchMcpTools } from '@social-monitor/social-research/mcp';
import { SocialResearchToolHandlers } from '@social-monitor/social-research/tools';

export type BuildSocialResearchMcpServerOptions = {
  readonly handlers?: SocialResearchToolHandlers;
  readonly gateway?: SocialResearchGateway;
  readonly sourceFetcher?: SourceFetcherPort;
  readonly threadReader?: SocialThreadReaderPort;
  readonly defaultExecutionScope?: SocialResearchExecutionScope;
  readonly executionPolicy?: SocialResearchExecutionPolicyPort;
  readonly resultCache?: SocialResearchResultCachePort;
  readonly continueOnLaneFailure?: boolean;
  readonly laneExecutionCompiler?: SourceFetcherLaneExecutionCompiler;
};

export const buildSocialResearchMcpServer = (
  options: BuildSocialResearchMcpServerOptions = {},
): McpServer => {
  const server = new McpServer({
    name: 'social-monitor-social-research',
    version: '0.1.0',
  });

  registerSocialResearchMcpTools(server, {
    handlers: toolHandlersFor(options),
  });

  return server;
};

const toolHandlersFor = (
  options: BuildSocialResearchMcpServerOptions,
): SocialResearchToolHandlers | undefined => {
  const hasRuntimeDependency =
    options.gateway !== undefined ||
    options.sourceFetcher !== undefined ||
    options.threadReader !== undefined ||
    options.executionPolicy !== undefined ||
    options.resultCache !== undefined;

  if (options.handlers !== undefined) {
    if (hasRuntimeDependency || options.defaultExecutionScope !== undefined) {
      throw new Error(
        'Provide either explicit social research handlers or runtime dependencies, not both.',
      );
    }

    return options.handlers;
  }

  if (
    options.gateway !== undefined &&
    (options.sourceFetcher !== undefined || options.threadReader !== undefined)
  ) {
    throw new Error(
      'Provide either SocialResearchGateway or SourceFetcherPort wiring, not both.',
    );
  }

  if (options.threadReader !== undefined && options.sourceFetcher === undefined) {
    throw new Error('Thread reader wiring requires a SourceFetcherPort.');
  }

  if (options.gateway !== undefined) {
    return new SocialResearchToolHandlers({
      gateway: options.gateway,
      defaultExecutionScope: options.defaultExecutionScope,
      executionPolicy: options.executionPolicy,
      resultCache: options.resultCache,
    });
  }

  if (options.sourceFetcher !== undefined) {
    return new SocialResearchToolHandlers({
      gateway: new SourceFetcherSocialResearchGateway(options.sourceFetcher, {
        executionScope: options.defaultExecutionScope,
        continueOnLaneFailure: options.continueOnLaneFailure,
        laneExecutionCompiler:
          options.laneExecutionCompiler ??
          createDefaultSourceFetcherLaneExecutionCompiler(),
        threadReader:
          options.threadReader ??
          new SourceFetcherSocialThreadReader(options.sourceFetcher),
      }),
      executionPolicy: options.executionPolicy,
      resultCache: options.resultCache,
    });
  }

  return undefined;
};
