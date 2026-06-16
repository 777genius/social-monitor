import { applyDecorators } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';

export const ApiKeyOrWorkspaceRoleAuth = (params: {
  readonly apiKeyScope: string;
  readonly workspaceRoleDescription: string;
}) =>
  applyDecorators(
    ApiHeader({
      name: 'authorization',
      required: false,
      description: `Optional Bearer API key. Requires ${params.apiKeyScope}. If supplied, x-workspace-role is not required.`,
    }),
    ApiHeader({
      name: 'x-workspace-role',
      required: false,
      description: `${params.workspaceRoleDescription} Required when Authorization bearer API key is not supplied.`,
    }),
  );
