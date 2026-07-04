import type { z } from 'zod';

import { SocialResearchToolHandlers } from '../tools/social-research-tool-handlers';
import {
  socialResearchToolDefinitions,
  type SocialResearchToolDefinition,
} from '../tools/social-research-tool-schemas';

export type SocialResearchMcpTextContent = {
  readonly type: 'text';
  readonly text: string;
};

export type SocialResearchMcpToolResult = {
  readonly content: SocialResearchMcpTextContent[];
  readonly isError?: boolean;
};

export type SocialResearchMcpToolConfig = {
  readonly description: string;
  readonly inputSchema: z.ZodType;
};

export type SocialResearchMcpToolRegistrar = {
  registerTool(
    name: string,
    config: SocialResearchMcpToolConfig,
    handler: (
      input: unknown,
      extra?: unknown,
    ) => Promise<SocialResearchMcpToolResult>,
  ): unknown;
};

export type RegisterSocialResearchMcpToolsOptions = {
  readonly handlers?: SocialResearchToolHandlers;
};

export const registerSocialResearchMcpTools = (
  registrar: SocialResearchMcpToolRegistrar,
  options: RegisterSocialResearchMcpToolsOptions = {},
): void => {
  const handlers = options.handlers ?? new SocialResearchToolHandlers();

  for (const definition of socialResearchToolDefinitions) {
    registrar.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: definition.inputSchema,
      },
      async (input) => mcpToolResultFor(definition, handlers, input),
    );
  }
};

const mcpToolResultFor = async (
  definition: SocialResearchToolDefinition,
  handlers: SocialResearchToolHandlers,
  input: unknown,
): Promise<SocialResearchMcpToolResult> => {
  try {
    const result = await executeTool(definition, handlers, input);

    return jsonToolResult(result);
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              error: {
                name: error instanceof Error ? error.name : 'Error',
                message:
                  error instanceof Error ? error.message : 'Unknown MCP tool error',
              },
            },
            null,
            2,
          ),
        },
      ],
    };
  }
};

const executeTool = (
  definition: SocialResearchToolDefinition,
  handlers: SocialResearchToolHandlers,
  input: unknown,
): Promise<unknown> | unknown => handlers[definition.handlerMethod](input);

const jsonToolResult = (value: unknown): SocialResearchMcpToolResult => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify(value, null, 2),
    },
  ],
});
