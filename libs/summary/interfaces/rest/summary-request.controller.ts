import { Body, Controller, Headers, Inject, Param, Post } from "@nestjs/common";
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  type WorkspaceAuthorizationPolicyPort,
} from "@social-monitor/identity/ports";
import { WorkspaceRoleHeaderParser } from "@social-monitor/identity/interfaces/authorization/workspace-role-header.parser";
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
} from "@social-monitor/identity/interfaces/rest/api-key-request-authorizer";
import { ApiKeyOrWorkspaceRoleAuth } from "@social-monitor/identity/interfaces/rest/api-key-openapi.decorators";
import { RequestCorrelationIdFactory } from "@social-monitor/platform-request-context";
import {
  requireTenantScope,
  type TenantId,
  type WorkspaceId,
} from "@social-monitor/shared-kernel";

import { RequestSummaryUseCase } from "../../features/request-summary/request-summary.use-case";
import {
  RequestSummaryRequestDto,
  RequestSummaryResponseDto,
} from "./request-summary.dto";
import { requireIdempotencyKeyHeader } from "./idempotency-key-header";

@ApiTags("summaries")
@Controller("topics/:topicId/summary-requests")
export class SummaryRequestController {
  constructor(
    private readonly requestSummary: RequestSummaryUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
    private readonly requestCorrelationIds: RequestCorrelationIdFactory,
  ) {}

  @Post()
  @ApiOperation({ summary: "Request a summary for a topic." })
  @ApiHeader({ name: "x-tenant-id", required: true })
  @ApiHeader({ name: "x-workspace-id", required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: "write:summaries",
    workspaceRoleDescription:
      "Comma-separated workspace roles. Summary requests require owner, admin or member.",
  })
  @ApiHeader({ name: "idempotency-key", required: true })
  @ApiCreatedResponse({ type: RequestSummaryResponseDto })
  async create(
    @Param("topicId") topicId: string,
    @Headers("x-tenant-id") tenantHeader: string | undefined,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Headers("x-workspace-role") workspaceRoleHeader: string | undefined,
    @Headers("authorization") authorizationHeader: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Headers("x-request-id") requestId: string | undefined,
    @Body() body: RequestSummaryRequestDto | undefined,
  ): Promise<RequestSummaryResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeSummaryWrite(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
      "summary_requests.create",
    );

    const result = await this.requestSummary.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      topicId,
      userId: body?.userId,
      subscriptionId: body?.subscriptionId,
      idempotencyKey: requireIdempotencyKeyHeader(idempotencyKey),
      correlationId: this.requestCorrelationIds.fromRequestId(requestId),
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  private async authorizeSummaryWrite(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    workspaceRoleHeader: string | undefined,
    authorizationHeader: string | undefined,
    operation: "summary_requests.create",
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
