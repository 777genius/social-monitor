import { Body, Controller, Headers, Inject, Post } from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { WorkspaceRoleHeaderParser } from "@social-monitor/identity/interfaces/authorization/workspace-role-header.parser";
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
} from "@social-monitor/identity/interfaces/rest/api-key-request-authorizer";
import { ApiKeyOrWorkspaceRoleAuth } from "@social-monitor/identity/interfaces/rest/api-key-openapi.decorators";
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  type WorkspaceAuthorizationPolicyPort,
} from "@social-monitor/identity/ports";
import { RequestCorrelationIdFactory } from "@social-monitor/platform-request-context";
import {
  DomainError,
  requireTenantScope,
  type TenantId,
  type WorkspaceId,
} from "@social-monitor/shared-kernel";

import type { ReaderSummaryScope } from "../../domain";
import { RequestReaderSummaryUseCase } from "../../features/request-reader-summary/request-reader-summary.use-case";
import { requestBriefingResponseFromReaderSummary } from "./briefing-legacy.mapper";
import {
  RequestBriefingRequestDto,
  RequestBriefingResponseDto,
} from "./request-briefing.dto";

@ApiTags("briefings")
@Controller("briefing-requests")
export class BriefingRequestController {
  constructor(
    private readonly requestReaderSummary: RequestReaderSummaryUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
    private readonly requestCorrelationIds: RequestCorrelationIdFactory,
  ) {}

  @Post()
  @ApiOperation({
    summary: "Request a briefing for a workspace or topic scope.",
  })
  @ApiHeader({ name: "x-tenant-id", required: true })
  @ApiHeader({ name: "x-workspace-id", required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: "write:summaries",
    workspaceRoleDescription:
      "Comma-separated workspace roles. Briefing requests require owner, admin or member.",
  })
  @ApiHeader({ name: "idempotency-key", required: true })
  @ApiBody({ type: RequestBriefingRequestDto })
  @ApiCreatedResponse({ type: RequestBriefingResponseDto })
  async create(
    @Headers("x-tenant-id") tenantHeader: string | undefined,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Headers("x-workspace-role") workspaceRoleHeader: string | undefined,
    @Headers("authorization") authorizationHeader: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string,
    @Headers("x-request-id") requestId: string | undefined,
    @Body() body: RequestBriefingRequestDto,
  ): Promise<RequestBriefingResponseDto> {
    const tenantScope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeBriefingWrite(
      tenantScope.tenantId,
      tenantScope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      "briefing_requests.create",
    );

    const result = await this.requestReaderSummary.execute({
      tenantId: tenantScope.tenantId,
      workspaceId: tenantScope.workspaceId,
      scope: normalizeBriefingScope(body.scope),
      userId: body.userId,
      subscriptionId: body.subscriptionId,
      idempotencyKey,
      correlationId: this.requestCorrelationIds.fromRequestId(requestId),
    });

    if (!result.ok) {
      throw result.error;
    }

    return requestBriefingResponseFromReaderSummary(result.value);
  }

  private async authorizeBriefingWrite(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    workspaceRoleHeader: string | undefined,
    authorizationHeader: string | undefined,
    operation: "briefing_requests.create",
  ): Promise<void> {
    if (hasBearerAuthorizationHeader(authorizationHeader)) {
      await this.apiKeyRequestAuthorizer.authorize({
        authorizationHeader,
        tenantId,
        workspaceId,
        requiredScope: "write:summaries",
        operation,
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: operation,
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}

const normalizeBriefingScope = (
  scope: RequestBriefingRequestDto["scope"] | undefined,
): ReaderSummaryScope => {
  if (scope === undefined) {
    throw new DomainError("validation.failed", "Briefing scope is required");
  }

  if (scope.type === "workspace") {
    return { type: "workspace" };
  }

  if (scope.type === "topic") {
    return { type: "topic", topicId: scope.topicId ?? "" };
  }

  throw new DomainError(
    "validation.failed",
    "Briefing scope type must be workspace or topic",
  );
};
