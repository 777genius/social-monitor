import { Injectable, type NestMiddleware } from '@nestjs/common';
import {
  CAUSATION_ID_HEADER,
  CORRELATION_ID_HEADER,
  REQUEST_ID_HEADER,
  buildRequestContext,
} from '@social-monitor/platform-request-context';
import {
  InvalidTenantDatabaseAccessError,
  runWithTenantDatabaseAccess,
} from '@social-monitor/platform-persistence';
import { DomainError, requireTenantScope } from '@social-monitor/shared-kernel';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const context = buildRequestContext({
      requestId: request.header(REQUEST_ID_HEADER),
      correlationId: request.header(CORRELATION_ID_HEADER),
      causationId: request.header(CAUSATION_ID_HEADER),
    });

    response.setHeader(REQUEST_ID_HEADER, context.requestId);
    response.setHeader(CORRELATION_ID_HEADER, context.correlationId);
    if (context.causationId) {
      response.setHeader(CAUSATION_ID_HEADER, context.causationId);
    }
    const tenantIdHeader = request.header('x-tenant-id');
    const workspaceIdHeader = request.header('x-workspace-id');
    if (
      tenantIdHeader === undefined ||
      tenantIdHeader.trim().length === 0 ||
      workspaceIdHeader === undefined ||
      workspaceIdHeader.trim().length === 0
    ) {
      next();
      return;
    }
    const scope = requireTenantScope({ tenantIdHeader, workspaceIdHeader });
    try {
      runWithTenantDatabaseAccess(scope, next);
    } catch (error) {
      if (error instanceof InvalidTenantDatabaseAccessError) {
        throw new DomainError(
          'validation.failed',
          'Tenant and workspace identifiers must be UUIDs',
          { field: error.field },
        );
      }
      throw error;
    }
  }
}
