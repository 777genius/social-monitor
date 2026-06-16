import { Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
} from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  parseWorkspaceRolesHeader,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { DomainError, requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';
import type { Server, Socket } from 'socket.io';

import type { RealtimeEvent } from '../../domain';
import { ListRealtimeEventsUseCase } from '../../features/list-realtime-events/list-realtime-events.use-case';
import type { RealtimeEventView } from '../../features/list-realtime-events/list-realtime-events.result';
import type { RealtimeFanoutPort } from '../../ports';

type RealtimeSubscribePayload = {
  readonly channel?: unknown;
  readonly cursor?: unknown;
  readonly limit?: unknown;
};

type RealtimeAck =
  | {
      readonly ok: true;
      readonly channel: string;
      readonly events: readonly RealtimeEventView[];
      readonly nextCursor?: string;
      readonly resyncRequired: boolean;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly details?: Readonly<Record<string, unknown>>;
      };
    };

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeEventsGateway implements RealtimeFanoutPort {
  @WebSocketServer()
  private server?: Server;

  constructor(
    private readonly listRealtimeEvents: ListRealtimeEventsUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
  ) {}

  @SubscribeMessage('realtime.subscribe')
  async subscribe(
    @MessageBody() payload: RealtimeSubscribePayload,
    @ConnectedSocket() socket: Socket,
  ): Promise<RealtimeAck> {
    return this.replay(payload, socket, true);
  }

  @SubscribeMessage('realtime.refresh')
  async refresh(
    @MessageBody() payload: RealtimeSubscribePayload,
    @ConnectedSocket() socket: Socket,
  ): Promise<RealtimeAck> {
    return this.replay(payload, socket, false);
  }

  async publish(event: RealtimeEvent): Promise<void> {
    if (this.server === undefined) {
      return;
    }

    const snapshot = event.toSnapshot();

    this.server
      .to(roomKey(snapshot.tenantId, snapshot.workspaceId, snapshot.channel))
      .emit('realtime.event', realtimeEventViewFromSnapshot(snapshot));
  }

  private async replay(
    payload: RealtimeSubscribePayload,
    socket: Socket,
    joinRoom: boolean,
  ): Promise<RealtimeAck> {
    try {
      const scope = requireTenantScope({
        tenantIdHeader: readSocketScopeValue(socket, 'x-tenant-id', 'tenantId'),
        workspaceIdHeader: readSocketScopeValue(socket, 'x-workspace-id', 'workspaceId'),
      });
      await this.authorizeRealtimeRead(
        scope.tenantId,
        scope.workspaceId,
        readSocketScopeValue(socket, 'authorization', 'authorization'),
        readSocketScopeValue(socket, 'x-workspace-role', 'workspaceRole'),
      );

      const channel = readNonEmptyString(payload.channel, 'channel');
      const result = await this.listRealtimeEvents.execute({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        channel,
        cursor: readOptionalString(payload.cursor, 'cursor'),
        limit: readLimit(payload.limit),
      });

      if (!result.ok) {
        throw result.error;
      }

      if (joinRoom) {
        await socket.join(roomKey(scope.tenantId, scope.workspaceId, channel));
      }

      return {
        ok: true,
        channel,
        events: result.value.events,
        nextCursor: result.value.nextCursor,
        resyncRequired: result.value.resyncRequired,
      };
    } catch (error) {
      return errorAck(error);
    }
  }

  private async authorizeRealtimeRead(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    authorizationHeader: string | undefined,
    workspaceRoleHeader: string | undefined,
  ): Promise<void> {
    if (hasBearerAuthorizationHeader(authorizationHeader)) {
      await this.apiKeyRequestAuthorizer.authorize({
        authorizationHeader,
        tenantId,
        workspaceId,
        requiredScope: 'read:delivery_status',
        operation: 'realtime_events.read',
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'realtime_events.read',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}

const readSocketScopeValue = (socket: Socket, headerName: string, authName: string): string | undefined => {
  const header = socket.handshake.headers[headerName];

  if (typeof header === 'string') {
    return header;
  }

  if (Array.isArray(header)) {
    return header[0];
  }

  const auth = socket.handshake.auth as Readonly<Record<string, unknown>> | undefined;
  const authValue = auth?.[authName];

  return typeof authValue === 'string' ? authValue : undefined;
};

const readNonEmptyString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainError('validation.failed', `Realtime ${field} must be non-empty`);
  }

  return value.trim();
};

const readOptionalString = (value: unknown, field: string): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  return readNonEmptyString(value, field);
};

const readLimit = (value: unknown): number => {
  if (value === undefined || value === null) {
    return 20;
  }

  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    return Number(value);
  }

  return Number.NaN;
};

const errorAck = (error: unknown): RealtimeAck => {
  if (error instanceof DomainError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: 'system.failure',
      message: error instanceof Error ? error.message : 'Realtime gateway failure',
    },
  };
};

const roomKey = (tenantId: string, workspaceId: string, channel: string): string =>
  `${tenantId}:${workspaceId}:${channel}`;

const realtimeEventViewFromSnapshot = (
  snapshot: ReturnType<RealtimeEvent['toSnapshot']>,
): RealtimeEventView => ({
  ...snapshot,
  tenantId: snapshot.tenantId,
  workspaceId: snapshot.workspaceId,
  correlationId: snapshot.correlationId,
  occurredAt: snapshot.occurredAt.toISOString(),
});
