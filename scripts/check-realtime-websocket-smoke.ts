import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DeliveryRestModule } from '@social-monitor/delivery/interfaces/rest/delivery-rest.module';
import { RecordRealtimeEventUseCase } from '@social-monitor/delivery/features/record-realtime-event/record-realtime-event.use-case';
import { correlationId, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { io, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';

import { DomainErrorFilter } from '../apps/api-gateway/src/domain-error.filter';

type RealtimeAck = {
  readonly ok: boolean;
  readonly channel?: string;
  readonly events?: readonly RealtimeEventMessage[];
  readonly nextCursor?: string;
  readonly resyncRequired?: boolean;
  readonly error?: {
    readonly code: string;
    readonly message: string;
  };
};

type RealtimeEventMessage = {
  readonly eventType: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly channel: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly sequence: number;
  readonly replayCursor: string;
  readonly payload: Readonly<Record<string, unknown>>;
};

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [DeliveryRestModule],
    providers: [
      {
        provide: APP_FILTER,
        useClass: DomainErrorFilter,
      },
    ],
  }).compile();
  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();
  await app.listen(0, '127.0.0.1');

  const socket = connectSocket(baseUrlFromAddress(app.getHttpServer().address()), {
    tenantId: 'tenant-realtime-ws-smoke',
    workspaceId: 'workspace-realtime-ws-smoke',
    workspaceRole: 'viewer',
  });

  try {
    await waitForConnect(socket);

    const channel = 'topic:topic-realtime-ws-smoke:summary-status';
    const initialReplay = await emitAck<RealtimeAck>(socket, 'realtime.subscribe', {
      channel,
      limit: 10,
    });

    assert(initialReplay.ok, `initial subscribe failed: ${initialReplay.error?.message ?? 'unknown error'}`);
    assert(initialReplay.channel === channel, 'subscribe ack must echo channel');
    assert(initialReplay.events?.length === 0, 'initial subscribe should have no events');
    assert(initialReplay.resyncRequired === false, 'initial subscribe should not require resync');

    const pushedEvent = waitForEvent(socket);
    const recorded = await app.get(RecordRealtimeEventUseCase).execute({
      tenantId: tenantId('tenant-realtime-ws-smoke'),
      workspaceId: workspaceId('workspace-realtime-ws-smoke'),
      channel,
      eventType: 'summary.status.changed.v1',
      resourceType: 'summary',
      resourceId: 'summary-realtime-ws-smoke',
      correlationId: correlationId('correlation-realtime-ws-smoke'),
      payload: {
        status: 'completed',
        summaryId: 'summary-realtime-ws-smoke',
      },
    });

    if (!recorded.ok) {
      throw new Error(`record realtime event failed: ${recorded.error.message}`);
    }

    const event = await pushedEvent;

    assert(event.eventType === 'summary.status.changed.v1', 'WS push must expose realtime event type');
    assert(event.channel === channel, 'WS push must stay inside subscribed channel');
    assert(event.sequence === recorded.value.sequence, 'WS push sequence must match durable event sequence');
    assert(event.payload.summaryId === 'summary-realtime-ws-smoke', 'WS push must include status hint payload');

    const replay = await emitAck<RealtimeAck>(socket, 'realtime.refresh', {
      channel,
      limit: 10,
    });

    assert(replay.ok, `refresh failed: ${replay.error?.message ?? 'unknown error'}`);
    const replayEvents = replay.events ?? [];
    assert(replayEvents.length === 1, 'refresh must replay durable event');
    assert(replayEvents[0]?.replayCursor === event.replayCursor, 'refresh replay cursor must match pushed event');

    const caughtUp = await emitAck<RealtimeAck>(socket, 'realtime.refresh', {
      channel,
      cursor: event.replayCursor,
      limit: 10,
    });

    assert(caughtUp.ok, `caught-up refresh failed: ${caughtUp.error?.message ?? 'unknown error'}`);
    assert(caughtUp.events?.length === 0, 'caught-up refresh should not replay delivered event');
    assert(caughtUp.resyncRequired === false, 'caught-up refresh should not require resync');

    const rejected = await emitAck<RealtimeAck>(socket, 'realtime.refresh', {
      channel: ' ',
      limit: 10,
    });

    assert(!rejected.ok, 'blank channel refresh must be rejected');
    assert(rejected.error?.code === 'validation.failed', 'blank channel rejection must be validation.failed');

    console.log('Realtime websocket smoke OK');
  } finally {
    socket.disconnect();
    await app.close();
  }
}

const connectSocket = (
  baseUrl: string,
  auth: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly workspaceRole: string;
  },
): Socket =>
  io(`${baseUrl}/realtime`, {
    autoConnect: false,
    auth,
  });

const waitForConnect = (socket: Socket): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for websocket connection')), 5000);

    socket.once('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.connect();
  });

const waitForEvent = (socket: Socket): Promise<RealtimeEventMessage> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for realtime.event')), 5000);

    socket.once('realtime.event', (event: RealtimeEventMessage) => {
      clearTimeout(timeout);
      resolve(event);
    });
  });

const emitAck = <T>(socket: Socket, event: string, payload: Readonly<Record<string, unknown>>): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event} ack`)), 5000);

    socket.emit(event, payload, (ack: T) => {
      clearTimeout(timeout);
      resolve(ack);
    });
  });

const baseUrlFromAddress = (address: string | AddressInfo | null): string => {
  if (address === null || typeof address === 'string') {
    throw new Error('Expected HTTP server to listen on TCP address');
  }

  return `http://127.0.0.1:${address.port}`;
};

void main();
