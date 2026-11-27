import { DomainError, err, ok } from '@social-monitor/shared-kernel';
import { StaticWorkspaceAuthorizationPolicy } from '@social-monitor/identity/adapters/authorization/static-workspace-authorization-policy';
import type { ApiKeyRequestAuthorizer } from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import type { Socket } from 'socket.io';

import type { ListRealtimeEventsUseCase } from '../../features/list-realtime-events/list-realtime-events.use-case';
import { RealtimeEventsGateway } from './realtime-events.gateway';

const CHANNEL = 'interest:one:summary-status';
const ROOM = `tenant:workspace:${CHANNEL}`;
const emptyResult = () => ok({ events: [], resyncRequired: false });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
};

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const createSocket = () => {
  const rooms = new Set<string>();
  const socket = {
    connected: true,
    rooms,
    handshake: {
      headers: {} as Record<string, string>,
      auth: { tenantId: 'tenant', workspaceId: 'workspace', workspaceRole: 'viewer' },
    },
    join: jest.fn(async (room: string) => { rooms.add(room); }),
    leave: jest.fn(async (room: string) => { rooms.delete(room); }),
    disconnect: jest.fn(),
  };
  socket.disconnect.mockImplementation(() => {
    socket.connected = false;
    rooms.clear();
    return socket;
  });
  return socket;
};

type TestSocket = ReturnType<typeof createSocket>;
const asSocket = (socket: TestSocket): Socket => socket as unknown as Socket;

const createGateway = () => {
  const execute = jest.fn<
    ReturnType<ListRealtimeEventsUseCase['execute']>,
    Parameters<ListRealtimeEventsUseCase['execute']>
  >().mockResolvedValue(emptyResult());
  const authorize = jest.fn().mockResolvedValue(undefined);
  const gateway = new RealtimeEventsGateway(
    { execute } as unknown as ListRealtimeEventsUseCase,
    { authorize } as unknown as ApiKeyRequestAuthorizer,
    new StaticWorkspaceAuthorizationPolicy(),
    new WorkspaceRoleHeaderParser({ NODE_ENV: 'test', TRUSTED_WORKSPACE_ROLE_HEADER: 'enabled' }),
  );
  return { gateway, execute, authorize };
};

describe('RealtimeEventsGateway replay ownership', () => {
  it('authorizes before joining and joins before reading replay', async () => {
    const { gateway, execute, authorize } = createGateway();
    const socket = createSocket();
    socket.handshake.headers.authorization = 'Bearer synthetic-api-key';
    const authorization = deferred<void>();
    authorize.mockReturnValue(authorization.promise);
    const order: string[] = [];
    socket.join.mockImplementation(async (room) => {
      order.push('join');
      socket.rooms.add(room);
    });
    execute.mockImplementation(async () => {
      order.push('read');
      expect(socket.rooms.has(ROOM)).toBe(true);
      return emptyResult();
    });

    const subscribing = gateway.subscribe({ channel: CHANNEL }, asSocket(socket));
    await settle();
    expect(socket.join).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
    authorization.resolve(undefined);

    await expect(subscribing).resolves.toMatchObject({ ok: true, channel: CHANNEL });
    expect(order).toEqual(['join', 'read']);
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant',
      workspaceId: 'workspace',
      requiredScope: 'read:delivery_status',
      operation: 'realtime_events.read',
    }));
  });

  it('never grants a room to an unauthorized socket', async () => {
    const { gateway, execute } = createGateway();
    const socket = createSocket();
    socket.handshake.auth.workspaceRole = '';

    await expect(gateway.subscribe({ channel: CHANNEL }, asSocket(socket))).resolves.toMatchObject({
      ok: false,
      error: { code: 'authorization.denied' },
    });
    expect(socket.join).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    null,
    [],
    'channel',
    {},
    { channel: '' },
    { channel: CHANNEL, cursor: '' },
    { channel: CHANNEL, limit: 0 },
    { channel: CHANNEL, limit: 101 },
    { channel: CHANNEL, limit: 1.5 },
    { channel: CHANNEL, limit: 'invalid' },
  ])('rejects malformed payload %j before room admission', async (payload) => {
    const { gateway, execute } = createGateway();
    const socket = createSocket();

    await expect(gateway.subscribe(payload, asSocket(socket))).resolves.toMatchObject({
      ok: false,
      error: { code: 'validation.failed' },
    });
    expect(socket.join).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('passes opaque cursors through to the existing resyncRequired response', async () => {
    const { gateway, execute } = createGateway();
    execute.mockResolvedValue(ok({ events: [], resyncRequired: true }));
    const socket = createSocket();

    await expect(gateway.subscribe({
      channel: CHANNEL,
      cursor: 'unknown-opaque-cursor',
      limit: '100',
    }, asSocket(socket))).resolves.toMatchObject({ ok: true, events: [], resyncRequired: true });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      cursor: 'unknown-opaque-cursor',
      limit: 100,
    }));
    expect(socket.rooms.has(ROOM)).toBe(true);
  });

  it('bounds overlap per socket while allowing another socket to replay', async () => {
    const { gateway, execute } = createGateway();
    const pending = deferred<Awaited<ReturnType<ListRealtimeEventsUseCase['execute']>>>();
    execute.mockReturnValueOnce(pending.promise);
    const socket = createSocket();
    const first = gateway.subscribe({ channel: CHANNEL }, asSocket(socket));
    await settle();

    const overlap = await gateway.subscribe({ channel: 'another-channel' }, asSocket(socket));
    expect(overlap).toMatchObject({ ok: false, error: { code: 'operation.backpressure' } });
    expect(socket.rooms).toEqual(new Set([ROOM]));
    await expect(gateway.subscribe({ channel: CHANNEL }, asSocket(createSocket())))
      .resolves.toMatchObject({ ok: true });
    expect(execute).toHaveBeenCalledTimes(2);

    pending.resolve(emptyResult());
    await first;
    await expect(gateway.refresh({ channel: CHANNEL }, asSocket(socket))).resolves.toMatchObject({ ok: true });
  });

  it('removes only the new room when replay fails and then accepts a retry', async () => {
    const { gateway, execute } = createGateway();
    execute.mockResolvedValueOnce(err(new DomainError('external.dependency_unavailable', 'Replay unavailable')));
    const socket = createSocket();
    const previousRoom = 'tenant:workspace:previous-channel';
    socket.rooms.add(previousRoom);

    await expect(gateway.subscribe({ channel: CHANNEL }, asSocket(socket))).resolves.toMatchObject({
      ok: false,
      error: { code: 'external.dependency_unavailable' },
    });
    expect(socket.rooms).toEqual(new Set([previousRoom]));
    expect(socket.leave).toHaveBeenCalledWith(ROOM);
    await expect(gateway.subscribe({ channel: CHANNEL }, asSocket(socket))).resolves.toMatchObject({ ok: true });
    expect(socket.rooms).toEqual(new Set([previousRoom, ROOM]));
  });

  it.each(['subscribe', 'refresh'] as const)(
    'preserves an existing room on failed %s',
    async (method) => {
      const { gateway, execute } = createGateway();
      execute.mockRejectedValue(new Error('repository failed'));
      const socket = createSocket();
      socket.rooms.add(ROOM);

      await expect(gateway[method]({ channel: CHANNEL }, asSocket(socket)))
        .resolves.toMatchObject({ ok: false, error: { code: 'system.failure' } });
      expect(socket.rooms.has(ROOM)).toBe(true);
      expect(socket.leave).not.toHaveBeenCalled();
    },
  );

  it('refreshes without creating a subscription', async () => {
    const { gateway } = createGateway();
    const socket = createSocket();

    await expect(gateway.refresh({ channel: CHANNEL }, asSocket(socket))).resolves.toMatchObject({ ok: true });
    expect(socket.join).not.toHaveBeenCalled();
    expect(socket.rooms.size).toBe(0);
  });

  it('does not join after disconnection during authorization', async () => {
    const { gateway, authorize, execute } = createGateway();
    const authorization = deferred<void>();
    authorize.mockReturnValue(authorization.promise);
    const socket = createSocket();
    socket.handshake.headers.authorization = 'Bearer synthetic-api-key';
    const pending = gateway.subscribe({ channel: CHANNEL }, asSocket(socket));
    socket.disconnect();
    authorization.resolve(undefined);

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { code: 'external.dependency_unavailable' },
    });
    expect(socket.join).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('cleans up a late asynchronous room grant after disconnection', async () => {
    const { gateway, execute } = createGateway();
    const socket = createSocket();
    const joined = deferred<void>();
    socket.join.mockImplementation(async (room) => {
      await joined.promise;
      socket.rooms.add(room);
    });
    const pending = gateway.subscribe({ channel: CHANNEL }, asSocket(socket));
    await settle();
    socket.disconnect();
    joined.resolve(undefined);

    await expect(pending).resolves.toMatchObject({ ok: false });
    expect(socket.leave).toHaveBeenCalledWith(ROOM);
    expect(socket.rooms.size).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it('cleans up after a partial join failure', async () => {
    const { gateway, execute } = createGateway();
    const socket = createSocket();
    socket.join.mockImplementation(async (room) => {
      socket.rooms.add(room);
      throw new Error('adapter join failed');
    });

    await expect(gateway.subscribe({ channel: CHANNEL }, asSocket(socket))).resolves.toMatchObject({
      ok: false,
      error: { code: 'system.failure', message: 'Realtime gateway failure' },
    });
    expect(socket.rooms.size).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it('cleans up a new subscription when the client disconnects during replay', async () => {
    const { gateway, execute } = createGateway();
    const pending = deferred<Awaited<ReturnType<ListRealtimeEventsUseCase['execute']>>>();
    execute.mockReturnValue(pending.promise);
    const socket = createSocket();
    const subscribing = gateway.subscribe({ channel: CHANNEL }, asSocket(socket));
    await settle();
    socket.disconnect();
    pending.resolve(emptyResult());

    await expect(subscribing).resolves.toMatchObject({ ok: false });
    expect(socket.rooms.size).toBe(0);
    expect(socket.leave).toHaveBeenCalledWith(ROOM);
  });

  it('disconnects when rollback fails instead of retaining an abandoned room', async () => {
    const { gateway, execute } = createGateway();
    execute.mockRejectedValue(new Error('read failed'));
    const socket = createSocket();
    socket.leave.mockRejectedValue(new Error('adapter leave failed'));

    await expect(gateway.subscribe({ channel: CHANNEL }, asSocket(socket))).resolves.toMatchObject({
      ok: false,
      error: { code: 'system.failure' },
    });
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.rooms.size).toBe(0);
  });

  it('redacts domain errors and hides unexpected exception messages', async () => {
    const { gateway, execute } = createGateway();
    const socket = createSocket();
    execute.mockRejectedValueOnce(new DomainError(
      'external.dependency_unavailable',
      'Upstream token=synthetic-secret-marker',
      { accessToken: 'synthetic-secret-marker', endpoint: 'https://example.test/?token=synthetic-secret-marker' },
    )).mockRejectedValueOnce(new Error('postgres://user:synthetic-secret-marker@host/db'));

    const domain = await gateway.refresh({ channel: CHANNEL }, asSocket(socket));
    expect(domain).toMatchObject({
      ok: false,
      error: {
        code: 'external.dependency_unavailable',
        details: { accessToken: '[REDACTED]' },
      },
    });
    expect(JSON.stringify(domain)).not.toContain('synthetic-secret-marker');
    await expect(gateway.refresh({ channel: CHANNEL }, asSocket(socket))).resolves.toEqual({
      ok: false,
      error: { code: 'system.failure', message: 'Realtime gateway failure' },
    });
  });
});
