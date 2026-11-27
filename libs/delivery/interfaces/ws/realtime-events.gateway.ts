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
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import {
  DomainError,
  redactSensitiveRecord,
  redactSensitiveText,
  requireTenantScope,
  type TenantId,
  type WorkspaceId,
} from '@social-monitor/shared-kernel';
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
  private readonly replaying = new WeakSet<Socket>();

  @WebSocketServer()
  private server?: Server;

  constructor(
    private readonly listRealtimeEvents: ListRealtimeEventsUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @SubscribeMessage('realtime.subscribe')
  async subscribe(
    @MessageBody() payload: unknown,
    @ConnectedSocket() socket: Socket,
  ): Promise<RealtimeAck> {
    return this.replay(payload, socket, true);
  }

  @SubscribeMessage('realtime.refresh')
  async refresh(
    @MessageBody() payload: unknown,
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
    payload: unknown,
    socket: Socket,
    joinRoom: boolean,
  ): Promise<RealtimeAck> {
    if (this.replaying.has(socket)) {
      return errorAck(new DomainError(
        'operation.backpressure',
        'Realtime replay is already in progress',
      ));
    }

    this.replaying.add(socket);
    let joinedRoom: string | undefined;
    try {
      const request = readReplayRequest(payload);
      requireConnected(socket);
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
      requireConnected(socket);

      const room = roomKey(scope.tenantId, scope.workspaceId, request.channel);
      if (joinRoom && !socket.rooms.has(room)) {
        // Own only the grant made by this operation. Duplicate subscriptions
        // and refresh failures must preserve an earlier successful grant.
        joinedRoom = room;
        await socket.join(room);
        requireConnected(socket);
      }

      // Join after authorization but before replay: a concurrent event may
      // arrive live and in replay, as allowed by the best-effort contract.
      const result = await this.listRealtimeEvents.execute({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        ...request,
      });
      if (!result.ok) {
        throw result.error;
      }
      requireConnected(socket);

      return {
        ok: true,
        channel: request.channel,
        events: result.value.events,
        nextCursor: result.value.nextCursor,
        resyncRequired: result.value.resyncRequired,
      };
    } catch (error) {
      if (joinedRoom !== undefined) {
        try {
          await socket.leave(joinedRoom);
        } catch {
          // A failed rollback cannot leave an abandoned subscription active.
          socket.disconnect();
        }
      }
      return errorAck(error);
    } finally {
      this.replaying.delete(socket);
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
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}

const requireConnected = (socket: Socket): void => {
  if (!socket.connected) {
    throw new DomainError(
      'external.dependency_unavailable',
      'Realtime client disconnected',
    );
  }
};

const readReplayRequest = (payload: unknown): {
  readonly channel: string;
  readonly cursor?: string;
  readonly limit: number;
} => {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new DomainError('validation.failed', 'Realtime payload must be an object');
  }
  const input = payload as RealtimeSubscribePayload;
  const channel = readNonEmptyString(input.channel, 'channel');
  const cursor = readOptionalString(input.cursor, 'cursor');
  const limit = readLimit(input.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new DomainError(
      'validation.failed',
      'Realtime event page limit must be between 1 and 100',
      { limit },
    );
  }
  // Cursor contents belong to the replay repository. An opaque invalid or
  // expired cursor must retain the existing resyncRequired response.
  return { channel, cursor, limit };
};

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
        message: redactSensitiveText(error.message),
        details: redactSensitiveRecord(error.details),
      },
    };
  }

  return {
    ok: false,
    error: {
      code: 'system.failure',
      message: 'Realtime gateway failure',
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
