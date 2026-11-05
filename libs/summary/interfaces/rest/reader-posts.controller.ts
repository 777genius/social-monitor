import { Controller, Get, Headers, Inject, Query } from "@nestjs/common";
import { ApiHeader, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { ApiKeyRequestAuthorizer, hasBearerAuthorizationHeader } from "@social-monitor/identity/interfaces/rest/api-key-request-authorizer";
import { ApiKeyOrWorkspaceRoleAuth } from "@social-monitor/identity/interfaces/rest/api-key-openapi.decorators";
import { WorkspaceRoleHeaderParser } from "@social-monitor/identity/interfaces/authorization/workspace-role-header.parser";
import { WORKSPACE_AUTHORIZATION_POLICY, type WorkspaceAuthorizationPolicyPort } from "@social-monitor/identity/ports";
import { parsePaginationLimit } from "@social-monitor/platform-request-context";
import { DomainError, requireTenantScope } from "@social-monitor/shared-kernel";
import { ListReaderPostsUseCase } from "../../features/list-reader-posts/list-reader-posts.use-case";
import { ReaderPostsPageDto } from "./reader-posts.dto";

@ApiTags("reader-summaries")
@Controller("reader-posts")
export class ReaderPostsController {
  constructor(private readonly posts: ListReaderPostsUseCase,
    private readonly keys: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY) private readonly policy: WorkspaceAuthorizationPolicyPort,
    private readonly roles: WorkspaceRoleHeaderParser) {}

  @Get()
  @ApiOperation({ summary: "Browse all collected posts in a period using saved assessments; no model calls." })
  @ApiHeader({ name: "x-tenant-id", required: true })
  @ApiHeader({ name: "x-workspace-id", required: true })
  @ApiKeyOrWorkspaceRoleAuth({ apiKeyScope: "read:feed", workspaceRoleDescription: "Workspace feed read access." })
  @ApiQuery({ name: "startedAt", required: true, type: String })
  @ApiQuery({ name: "endedAt", required: true, type: String })
  @ApiQuery({ name: "interestId", required: false, type: String })
  @ApiQuery({ name: "order", required: false, enum: ["model", "likes"] })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "excludedProviders", required: false, type: String })
  @ApiQuery({ name: "cursor", required: false, type: String })
  @ApiOkResponse({ type: ReaderPostsPageDto })
  async list(
    @Headers("x-tenant-id") tenantHeader: string | undefined,
    @Headers("x-workspace-id") workspaceHeader: string | undefined,
    @Headers("x-workspace-role") workspaceRole: string | undefined,
    @Headers("authorization") authorization: string | undefined,
    @Query("startedAt") startedAt: string | undefined,
    @Query("endedAt") endedAt: string | undefined,
    @Query("interestId") interestId: string | undefined,
    @Query("order") order: string | undefined,
    @Query("limit") limit: string | undefined,
    @Query("cursor") cursor: string | undefined,
    @Query("excludedProviders") excludedProviders: string | undefined,
  ): Promise<ReaderPostsPageDto> {
    const scope = requireTenantScope({ tenantIdHeader: tenantHeader, workspaceIdHeader: workspaceHeader });
    if (hasBearerAuthorizationHeader(authorization)) {
      await this.keys.authorize({ authorizationHeader: authorization,
        ...scope, requiredScope: "read:feed", operation: "feed.read" });
    } else {
      const authorized = this.policy.authorize({ ...scope, action: "feed.read", roles: this.roles.parse(workspaceRole) });
      if (!authorized.ok) throw authorized.error;
    }
    if (order !== undefined && order !== "model" && order !== "likes") {
      throw new DomainError("validation.failed", "Invalid post order");
    }
    if (interestId !== undefined && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(interestId)) {
      throw new DomainError("validation.failed", "Invalid interest id");
    }
    if (excludedProviders !== undefined && (excludedProviders.length > 1000 || !/^[a-z0-9_,.-]*$/i.test(excludedProviders))) {
      throw new DomainError("validation.failed", "Invalid provider filter");
    }
    const result = await this.posts.execute({ ...scope, interestId,
      startedAt: new Date(startedAt ?? ""), endedAt: new Date(endedAt ?? ""),
      order: order ?? "model", cursor, excludedProviders: excludedProviders?.split(","),
      limit: parsePaginationLimit(limit, { defaultLimit: 12, invalidMessage: "Post page limit must be between 1 and 100" }),
    });
    if (!result.ok) throw result.error;
    return result.value;
  }
}
