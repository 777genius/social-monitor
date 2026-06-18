import { Controller, Get, Headers, Inject, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import { parsePaginationLimit } from '@social-monitor/platform-request-context';
import { DomainError, requireTenantScope } from '@social-monitor/shared-kernel';

import { ListPublicApiAuditEventsUseCase } from '../../features/list-public-api-audit-events/list-public-api-audit-events.use-case';
import type { PublicApiAuditOutcome, PublicApiAuditRecord } from '../../ports';
import type { ListPublicApiAuditEventsResponseDto } from './public-api-audit-events.dto';

const actorTypes = ['api_key', 'system'] as const satisfies readonly PublicApiAuditRecord['actorType'][];
const outcomes = ['succeeded', 'failed', 'denied'] as const satisfies readonly PublicApiAuditOutcome[];

@ApiTags('usage')
@Controller('usage/audit-events')
export class PublicApiAuditEventsController {
  constructor(
    private readonly listPublicApiAuditEvents: ListPublicApiAuditEventsUseCase,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tenant/workspace public API audit events for beta support and investigations.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Audit event reads require owner or admin.',
  })
  @ApiQuery({ name: 'actorType', required: false, enum: actorTypes })
  @ApiQuery({ name: 'actorId', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'outcome', required: false, enum: outcomes })
  @ApiQuery({ name: 'resourceType', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Query('actorType') actorType: string | undefined,
    @Query('actorId') actorId: string | undefined,
    @Query('action') action: string | undefined,
    @Query('outcome') outcome: string | undefined,
    @Query('resourceType') resourceType: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListPublicApiAuditEventsResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = this.workspaceAuthorization.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'public_api_audit.read',
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    const result = await this.listPublicApiAuditEvents.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      actorType: parseActorType(actorType),
      actorId,
      action,
      outcome: parseOutcome(outcome),
      resourceType,
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 50,
        invalidMessage: 'Public API audit event page limit must be between 1 and 100',
      }),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}

const parseActorType = (value: string | undefined): PublicApiAuditRecord['actorType'] | undefined => {
  const normalized = normalizeOptionalQueryValue(value);

  if (normalized === undefined) {
    return undefined;
  }

  if ((actorTypes as readonly string[]).includes(normalized)) {
    return normalized as PublicApiAuditRecord['actorType'];
  }

  throw new DomainError('validation.failed', 'Audit actorType filter is unsupported', {
    actorType: value,
  });
};

const parseOutcome = (value: string | undefined): PublicApiAuditOutcome | undefined => {
  const normalized = normalizeOptionalQueryValue(value);

  if (normalized === undefined) {
    return undefined;
  }

  if ((outcomes as readonly string[]).includes(normalized)) {
    return normalized as PublicApiAuditOutcome;
  }

  throw new DomainError('validation.failed', 'Audit outcome filter is unsupported', {
    outcome: value,
  });
};

const normalizeOptionalQueryValue = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
};
