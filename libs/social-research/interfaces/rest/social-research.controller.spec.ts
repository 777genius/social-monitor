import { DomainError, err, ok } from '@social-monitor/shared-kernel';
import type { ApiKeyRequestAuthorizer } from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import type { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import type {
  WorkspaceAuthorizationPolicyPort,
  WorkspaceAuthorizationRequest,
} from '@social-monitor/identity/ports';

import type { SocialResearchToolHandlers } from '../tools/social-research-tool-handlers';
import { SocialResearchController } from './social-research.controller';

describe('SocialResearchController', () => {
  it('builds execution scope from trusted headers instead of request body tenant fields', async () => {
    const handlerInputs: unknown[] = [];
    const authorizationRequests: WorkspaceAuthorizationRequest[] = [];
    const controller = controllerWith({
      handlers: {
        async searchSocial(input: unknown) {
          handlerInputs.push(input);

          return {
            plan: {
              normalizedTopic: 'AI agents',
              lanes: [],
              warnings: [],
            },
            items: [],
            warnings: [],
            partial: false,
          };
        },
      },
      authorizationRequests,
    });

    await controller.search(
      'tenant-header',
      'workspace-header',
      'viewer',
      undefined,
      {
        topic: 'AI agents',
        preset: 'broad_research',
        sources: 'reddit',
        accounts: [{ handle: '@openai', sourceKey: 'x-twitter' }],
        products: 'Claude Code',
        keywords: ['MCP'],
        communities: [{ name: 'ClaudeAI', sourceKey: 'reddit' }],
        urls: 'https://example.test/research',
        execution: {
          tenantId: 'tenant-body',
          workspaceId: 'workspace-body',
          scanJobId: 'scan-rest-test',
          sourceBindingIdBySource: {
            reddit: 'binding-reddit',
          },
        },
      } as never,
    );

    expect(handlerInputs).toEqual([
      expect.objectContaining({
        preset: 'broad_research',
        sources: 'reddit',
        accounts: [{ handle: '@openai', sourceKey: 'x-twitter' }],
        products: 'Claude Code',
        keywords: ['MCP'],
        communities: [{ name: 'ClaudeAI', sourceKey: 'reddit' }],
        urls: 'https://example.test/research',
        execution: expect.objectContaining({
          tenantId: 'tenant-header',
          workspaceId: 'workspace-header',
          scanJobId: 'scan-rest-test',
          sourceBindingIdBySource: {
            reddit: 'binding-reddit',
          },
        }),
      }),
    ]);
    expect(authorizationRequests).toEqual([
      expect.objectContaining({
        action: 'feed.read',
        tenantId: 'tenant-header',
        workspaceId: 'workspace-header',
        roles: ['viewer'],
      }),
    ]);
  });

  it('surfaces workspace authorization failures before handler execution', async () => {
    const handlerInputs: unknown[] = [];
    const controller = controllerWith({
      handlers: {
        explainSearchPlan(input: unknown) {
          handlerInputs.push(input);
          throw new Error('should not execute');
        },
      },
      authorizationError: new DomainError('authorization.denied', 'denied'),
    });

    await expect(
      controller.explainPlan(
        'tenant-header',
        'workspace-header',
        'viewer',
        undefined,
        {
          topic: 'AI agents',
        },
      ),
    ).rejects.toMatchObject({
      code: 'authorization.denied',
    });
    expect(handlerInputs).toEqual([]);
  });
});

const controllerWith = (params: {
  readonly handlers: Readonly<Record<string, unknown>>;
  readonly authorizationRequests?: WorkspaceAuthorizationRequest[];
  readonly authorizationError?: DomainError;
}): SocialResearchController => {
  const workspaceAuthorization: WorkspaceAuthorizationPolicyPort = {
    authorize(request) {
      params.authorizationRequests?.push(request);

      return params.authorizationError === undefined
        ? ok(undefined)
        : err(params.authorizationError);
    },
  };

  return new SocialResearchController(
    params.handlers as unknown as SocialResearchToolHandlers,
    {
      async authorize() {
        throw new Error('unexpected bearer authorization');
      },
    } as unknown as ApiKeyRequestAuthorizer,
    workspaceAuthorization,
    {
      parse(header: string | undefined) {
        return (header ?? '')
          .split(',')
          .map((role) => role.trim())
          .filter((role) => role.length > 0);
      },
    } as unknown as WorkspaceRoleHeaderParser,
  );
};
