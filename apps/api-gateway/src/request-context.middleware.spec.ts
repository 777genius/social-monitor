import { currentDatabaseAccess } from '@social-monitor/platform-persistence';
import type { NextFunction, Request, Response } from 'express';

import { RequestContextMiddleware } from './request-context.middleware';

const tenantId = '11111111-1111-4111-8111-111111111111';
const workspaceId = '22222222-2222-4222-8222-222222222222';

describe('RequestContextMiddleware', () => {
  it('propagates a complete tenant header pair to database access context', () => {
    const middleware = new RequestContextMiddleware();
    const request = requestWithHeaders({
      'x-tenant-id': tenantId,
      'x-workspace-id': workspaceId,
    });
    const response = responseStub();
    let observed: unknown;

    middleware.use(request, response, (() => {
      observed = currentDatabaseAccess();
    }) as NextFunction);

    expect(observed).toEqual({
      kind: 'tenant',
      tenantId,
      workspaceId,
    });
    expect(currentDatabaseAccess()).toBeUndefined();
  });

  it('does not create a partial database scope', () => {
    const middleware = new RequestContextMiddleware();
    let observed: unknown = 'not-called';

    middleware.use(
      requestWithHeaders({ 'x-tenant-id': tenantId }),
      responseStub(),
      (() => {
        observed = currentDatabaseAccess();
      }) as NextFunction,
    );

    expect(observed).toBeUndefined();
  });
});

function requestWithHeaders(headers: Readonly<Record<string, string>>): Request {
  return {
    header(name: string): string | undefined {
      return headers[name.toLowerCase()];
    },
  } as Request;
}

function responseStub(): Response {
  return {
    setHeader: jest.fn(),
  } as unknown as Response;
}
