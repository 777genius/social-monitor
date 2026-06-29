import { Body, Controller, Get, Headers, Patch } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyOrWorkspaceRoleAuth } from '@social-monitor/identity/interfaces/rest/api-key-openapi.decorators';
import { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import { buildRequestContext } from '@social-monitor/platform-request-context';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { GetWorkspaceSettingsUseCase } from '../../features/get-workspace-settings/get-workspace-settings.use-case';
import type { GetWorkspaceSettingsResult } from '../../features/get-workspace-settings/get-workspace-settings.result';
import { UpdateWorkspaceDigestPreferenceUseCase } from '../../features/update-workspace-digest-preference/update-workspace-digest-preference.use-case';
import { UpdateWorkspaceTelemetryConsentUseCase } from '../../features/update-workspace-telemetry-consent/update-workspace-telemetry-consent.use-case';
import { DeliveryReadAuthorizer } from './delivery-read.authorizer';
import {
  UpdateWorkspaceDigestPreferenceRequestDto,
  UpdateWorkspaceTelemetryConsentRequestDto,
  WorkspaceSettingsResponseDto,
} from './workspace-settings.dto';

@ApiTags('workspace-settings')
@Controller('workspace-settings')
export class WorkspaceSettingsController {
  constructor(
    private readonly getWorkspaceSettings: GetWorkspaceSettingsUseCase,
    private readonly updateWorkspaceDigestPreference: UpdateWorkspaceDigestPreferenceUseCase,
    private readonly updateWorkspaceTelemetryConsent: UpdateWorkspaceTelemetryConsentUseCase,
    private readonly deliveryReadAuthorizer: DeliveryReadAuthorizer,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get workspace settings for the current tenant/workspace.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'x-correlation-id', required: false })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:delivery_status',
    workspaceRoleDescription: 'Comma-separated workspace roles. Settings reads allow owner, admin, member or viewer.',
  })
  @ApiOkResponse({ type: WorkspaceSettingsResponseDto })
  async get(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Headers('x-correlation-id') correlationHeader: string | undefined,
  ): Promise<WorkspaceSettingsResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });

    await this.authorizeRead(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);

    const result = await this.getWorkspaceSettings.execute(scope);

    if (!result.ok) {
      throw result.error;
    }

    return this.toResponse(result.value, {
      workspaceRoleHeader,
      requestId,
      correlationHeader,
    });
  }

  @Patch('digest')
  @ApiOperation({ summary: 'Update workspace digest preference.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'x-correlation-id', required: false })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:delivery_status',
    workspaceRoleDescription: 'Comma-separated workspace roles. Settings writes allow owner, admin or member.',
  })
  @ApiOkResponse({ type: WorkspaceSettingsResponseDto })
  async updateDigest(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Headers('x-correlation-id') correlationHeader: string | undefined,
    @Body() body: UpdateWorkspaceDigestPreferenceRequestDto,
  ): Promise<WorkspaceSettingsResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });

    await this.authorizeWrite(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);

    const result = await this.updateWorkspaceDigestPreference.execute({
      ...scope,
      frequency: body.frequency,
    });

    if (!result.ok) {
      throw result.error;
    }

    return this.toResponse(result.value, {
      workspaceRoleHeader,
      requestId,
      correlationHeader,
    });
  }

  @Patch('telemetry')
  @ApiOperation({ summary: 'Update workspace telemetry consent preference.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'x-correlation-id', required: false })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:delivery_status',
    workspaceRoleDescription: 'Comma-separated workspace roles. Settings writes allow owner, admin or member.',
  })
  @ApiOkResponse({ type: WorkspaceSettingsResponseDto })
  async updateTelemetry(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Headers('x-correlation-id') correlationHeader: string | undefined,
    @Body() body: UpdateWorkspaceTelemetryConsentRequestDto,
  ): Promise<WorkspaceSettingsResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });

    await this.authorizeWrite(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);

    const result = await this.updateWorkspaceTelemetryConsent.execute({
      ...scope,
      consent: body.consent,
    });

    if (!result.ok) {
      throw result.error;
    }

    return this.toResponse(result.value, {
      workspaceRoleHeader,
      requestId,
      correlationHeader,
    });
  }

  private async authorizeRead(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    workspaceRoleHeader: string | undefined,
    authorizationHeader: string | undefined,
  ): Promise<void> {
    await this.deliveryReadAuthorizer.authorize({
      tenantId,
      workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      requiredScope: 'read:delivery_status',
      action: 'notification_preferences.read',
      operation: 'notification_preferences.read',
    });
  }

  private async authorizeWrite(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    workspaceRoleHeader: string | undefined,
    authorizationHeader: string | undefined,
  ): Promise<void> {
    await this.deliveryReadAuthorizer.authorize({
      tenantId,
      workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      requiredScope: 'write:delivery_status',
      action: 'notification_preferences.write',
      operation: 'notification_preferences.write',
    });
  }

  private toResponse(
    settings: GetWorkspaceSettingsResult,
    contextHeaders: {
      readonly workspaceRoleHeader: string | undefined;
      readonly requestId: string | undefined;
      readonly correlationHeader: string | undefined;
    },
  ): WorkspaceSettingsResponseDto {
    const requestContext = buildRequestContext({
      requestId: contextHeaders.requestId,
      correlationId: contextHeaders.correlationHeader,
    });

    return {
      workspaceRole: this.workspaceRoleHeaderParser.parse(contextHeaders.workspaceRoleHeader)[0] ?? 'unknown',
      digestFrequency: settings.digestFrequency,
      telemetryConsent: settings.telemetryConsent,
      diagnostics: {
        traceId: requestContext.correlationId,
        routeId: 'settings',
        releaseVersion: 'frontend-mvp',
        featureSnapshot: 'auth,interests,sources,feed,summaries,settings',
      },
    };
  }
}
