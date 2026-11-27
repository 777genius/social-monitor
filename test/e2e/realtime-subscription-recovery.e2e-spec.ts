import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  FixedClock,
  correlationId,
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';
import { InMemoryRealtimeEventRepository } from '@social-monitor/delivery/adapters/persistence/in-memory-realtime-event.repository';
import { ListRealtimeEventsUseCase } from '@social-monitor/delivery/features/list-realtime-events/list-realtime-events.use-case';
import { RecordRealtimeEventUseCase } from '@social-monitor/delivery/features/record-realtime-event/record-realtime-event.use-case';
import { RealtimeEventsGateway } from '@social-monitor/delivery/interfaces/ws/realtime-events.gateway';
import { encodeRealtimeReplayCursor } from '@social-monitor/delivery/domain';
import { StaticWorkspaceAuthorizationPolicy } from '@social-monitor/identity/adapters/authorization/static-workspace-authorization-policy';
import { ApiKeyRequestAuthorizer } from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import { WORKSPACE_AUTHORIZATION_POLICY } from '@social-monitor/identity/ports';
import type { Namespace, Socket as ServerSocket } from 'socket.io';
import { io, type Socket } from 'socket.io-client';

type ReplayAck = Awaited<ReturnType<RealtimeEventsGateway['subscribe']>>;
const CHANNEL = 'interest:socket-recovery:summary-status';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
};

const deadline = <T>(promise: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Socket test operation timed out')), 3_000);
    }),
  ]).finally(() => clearTimeout(timer));
};

const acknowledge = (client: Socket, event: string, payload: unknown): Promise<ReplayAck> =>
  new Promise((resolve, reject) => {
    client.timeout(3_000).emit(event, payload, (error: Error | null, ack: ReplayAck) => {
      if (error) reject(error);
      else resolve(ack);
    });
  });

describe('Realtime subscription recovery over Socket.IO (e2e)', () => {
  let app: INestApplication;
  let gateway: RealtimeEventsGateway;
  let repository: InMemoryRealtimeEventRepository;
  let recorder: RecordRealtimeEventUseCase;
  let baseUrl: string;
  let clients: Socket[];
  let releases: (() => void)[];

  beforeEach(async () => {
    clients = [];
    releases = [];
    repository = new InMemoryRealtimeEventRepository();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RealtimeEventsGateway,
        { provide: ListRealtimeEventsUseCase, useValue: new ListRealtimeEventsUseCase(repository) },
        { provide: ApiKeyRequestAuthorizer, useValue: { authorize: jest.fn().mockResolvedValue(undefined) } },
        { provide: WORKSPACE_AUTHORIZATION_POLICY, useValue: new StaticWorkspaceAuthorizationPolicy() },
        {
          provide: WorkspaceRoleHeaderParser,
          useValue: new WorkspaceRoleHeaderParser({
            NODE_ENV: 'test',
            TRUSTED_WORKSPACE_ROLE_HEADER: 'enabled',
          }),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    gateway = app.get(RealtimeEventsGateway);
    let id = 0;
    recorder = new RecordRealtimeEventUseCase(
      repository,
      { generate: () => `socket-recovery-event-${++id}` },
      new FixedClock(new Date('2026-11-27T00:00:00.000Z')),
      gateway,
    );
  });

  afterEach(async () => {
    for (const release of releases) release();
    for (const client of clients) client.disconnect();
    jest.restoreAllMocks();
    await app.close();
  });

  const connect = async (tenant: string, workspace = 'workspace', role = 'viewer'): Promise<Socket> => {
    const client = io(`${baseUrl}/realtime`, {
      transports: ['websocket'],
      autoConnect: false,
      reconnection: false,
      auth: { tenantId: tenant, workspaceId: workspace, workspaceRole: role },
    });
    clients.push(client);
    await deadline(new Promise<void>((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
      client.connect();
    }));
    return client;
  };

  const record = async (tenant: string, resourceId: string, workspace = 'workspace') => {
    const result = await recorder.execute({
      tenantId: tenantId(tenant),
      workspaceId: workspaceId(workspace),
      channel: CHANNEL,
      eventType: 'summary.status.changed.v1',
      resourceType: 'summary',
      resourceId,
      correlationId: correlationId(`correlation-${resourceId}`),
      payload: { summaryId: resourceId, status: 'ready' },
    });
    if (!result.ok) throw result.error;
    return result.value;
  };

  const pauseNextReplay = () => {
    const started = deferred<void>();
    const released = deferred<void>();
    const original = repository.list.bind(repository);
    jest.spyOn(repository, 'list').mockImplementationOnce(async (query) => {
      const snapshot = await original(query);
      started.resolve(undefined);
      await released.promise;
      return snapshot;
    });
    const release = () => released.resolve(undefined);
    releases.push(release);
    return { started: started.promise, release };
  };

  const serverSocket = (client: Socket): ServerSocket => {
    const namespace = (gateway as unknown as { server: Namespace }).server;
    const socket = namespace.sockets.get(client.id!);
    if (!socket) throw new Error('Connected test socket was not found');
    return socket;
  };

  it('receives an event published after the replay read and before its acknowledgement', async () => {
    const client = await connect('tenant-one');
    const received: { id: string }[] = [];
    client.on('realtime.event', (event: { id: string }) => received.push(event));
    const replay = pauseNextReplay();
    const subscribed = acknowledge(client, 'realtime.subscribe', { channel: CHANNEL });
    try {
      await deadline(replay.started);
      const event = await record('tenant-one', 'during-replay');
      replay.release();
      const ack = await subscribed;

      expect(ack).toMatchObject({ ok: true, events: [], resyncRequired: false });
      // Socket.IO preserves packet order: the live event was sent before the ack.
      expect(received.map((item) => item.id)).toContain(event.eventId);
    } finally {
      replay.release();
      await subscribed.catch(() => undefined);
    }
  });

  it('keeps live events and replay isolated by both tenant and workspace', async () => {
    const one = await connect('tenant-one', 'shared-workspace');
    const otherTenant = await connect('tenant-two', 'shared-workspace');
    const otherWorkspace = await connect('tenant-one', 'other-workspace');
    const streams = [one, otherTenant, otherWorkspace].map((client) => {
      const events: { id: string }[] = [];
      client.on('realtime.event', (event: { id: string }) => events.push(event));
      return events;
    });
    for (const client of [one, otherTenant, otherWorkspace]) {
      expect(await acknowledge(client, 'realtime.subscribe', { channel: CHANNEL })).toMatchObject({ ok: true });
    }
    const first = await record('tenant-one', 'first', 'shared-workspace');
    const second = await record('tenant-two', 'second', 'shared-workspace');
    const third = await record('tenant-one', 'third', 'other-workspace');
    const expectedIds = [first.eventId, second.eventId, third.eventId];

    for (const [index, client] of [one, otherTenant, otherWorkspace].entries()) {
      const ack = await acknowledge(client, 'realtime.refresh', { channel: CHANNEL });
      expect(ack).toMatchObject({ ok: true, events: [{ id: expectedIds[index] }] });
      expect(streams[index]!.map((event) => event.id)).toEqual([expectedIds[index]]);
    }
  });

  it('fails closed on authorization and payload errors before any room grant', async () => {
    const denied = await connect('tenant-one', 'workspace', '');
    const deniedPeer = serverSocket(denied);
    expect(await acknowledge(denied, 'realtime.subscribe', { channel: CHANNEL })).toMatchObject({
      ok: false,
      error: { code: 'authorization.denied' },
    });
    expect([...deniedPeer.rooms]).toEqual([denied.id]);

    const malformed = await connect('tenant-one');
    const malformedPeer = serverSocket(malformed);
    expect(await acknowledge(malformed, 'realtime.subscribe', { channel: CHANNEL, limit: 101 })).toMatchObject({
      ok: false,
      error: { code: 'validation.failed' },
    });
    expect([...malformedPeer.rooms]).toEqual([malformed.id]);
  });

  it('keeps invalid and future opaque cursors on the existing resync path', async () => {
    const client = await connect('tenant-one');
    await record('tenant-one', 'existing');
    for (const cursor of ['unknown-opaque-cursor', encodeRealtimeReplayCursor(999)]) {
      expect(await acknowledge(client, 'realtime.subscribe', { channel: CHANNEL, cursor })).toMatchObject({
        ok: true,
        events: [],
        resyncRequired: true,
      });
    }
  });

  it('rejects overlapping replay for one socket while other clients keep working', async () => {
    const one = await connect('tenant-one');
    const two = await connect('tenant-two');
    const replay = pauseNextReplay();
    const first = acknowledge(one, 'realtime.subscribe', { channel: CHANNEL });
    try {
      await deadline(replay.started);
      expect(await acknowledge(one, 'realtime.refresh', { channel: CHANNEL })).toMatchObject({
        ok: false,
        error: { code: 'operation.backpressure' },
      });
      expect(await acknowledge(two, 'realtime.subscribe', { channel: CHANNEL })).toMatchObject({ ok: true });
      replay.release();
      expect(await first).toMatchObject({ ok: true });
      expect(await acknowledge(one, 'realtime.refresh', { channel: CHANNEL })).toMatchObject({ ok: true });
    } finally {
      replay.release();
      await first.catch(() => undefined);
    }
  });

  it('removes a failed new grant, returns a safe error, and recovers without restarting', async () => {
    const client = await connect('tenant-one');
    const peer = serverSocket(client);
    jest.spyOn(repository, 'list').mockRejectedValueOnce(
      new Error('postgres://user:raw-password@host/database'),
    );
    expect(await acknowledge(client, 'realtime.subscribe', { channel: CHANNEL })).toEqual({
      ok: false,
      error: { code: 'system.failure', message: 'Realtime gateway failure' },
    });
    expect([...peer.rooms]).toEqual([client.id]);

    expect(await acknowledge(client, 'realtime.subscribe', { channel: CHANNEL })).toMatchObject({ ok: true });
    const recorded = await record('tenant-one', 'after-failure');
    expect(await acknowledge(client, 'realtime.refresh', { channel: CHANNEL })).toMatchObject({
      ok: true,
      events: [{ id: recorded.eventId }],
    });
  });

  it('cleans up a disconnect during replay and lets a new connection replay retained events', async () => {
    const client = await connect('tenant-one');
    const peer = serverSocket(client);
    const replay = pauseNextReplay();
    // This socket disconnects before an ack can arrive; observe its timeout/error.
    const pending = acknowledge(client, 'realtime.subscribe', { channel: CHANNEL }).catch(() => undefined);
    try {
      await deadline(replay.started);
      const disconnected = new Promise<void>((resolve) => peer.once('disconnect', () => resolve()));
      client.disconnect();
      await deadline(disconnected);
      replay.release();
      expect(peer.rooms.size).toBe(0);

      const recorded = await record('tenant-one', 'while-disconnected');
      const reconnected = await connect('tenant-one');
      expect(await acknowledge(reconnected, 'realtime.subscribe', { channel: CHANNEL })).toMatchObject({
        ok: true,
        events: [{ id: recorded.eventId }],
      });
    } finally {
      replay.release();
      await pending;
    }
  });
});
