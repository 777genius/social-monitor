import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { APP_FILTER } from '@nestjs/core';
import { DomainError, FixedClock, err, ok, tenantId, userId, workspaceId } from '@social-monitor/shared-kernel';
import { GetAuthSessionUseCase } from '@social-monitor/identity/features/get-auth-session/get-auth-session.use-case';
import type { GetAuthSessionResult } from '@social-monitor/identity/features/get-auth-session/get-auth-session.result';
import { ListReaderSummariesUseCase } from '@social-monitor/summary/features/list-reader-summaries/list-reader-summaries.use-case';
import { ListReaderSummaryPeriodsUseCase } from '@social-monitor/summary/features/list-reader-summary-periods/list-reader-summary-periods.use-case';
import request from 'supertest';

import { AppBootstrapController } from '../../apps/api-gateway/src/app-bootstrap.controller';
import { AppBootstrapReaderSummaryCache } from '../../apps/api-gateway/src/app-bootstrap-reader-summary-cache';
import { AppBootstrapReaderSummaryQuery } from '../../apps/api-gateway/src/app-bootstrap-reader-summary-query';
import { DomainErrorFilter } from '../../apps/api-gateway/src/domain-error.filter';

const sessionFor = (name: string): GetAuthSessionResult => ({
  userId: userId(`user-${name}`),
  userLabel: `User ${name}`,
  userRole: 'user',
  selectedWorkspace: {
    tenantId: tenantId(`tenant-${name}`),
    workspaceId: workspaceId('shared-workspace'),
    tenantName: `Tenant ${name}`,
    workspaceName: 'Shared workspace',
    workspaceRole: 'viewer',
    statusLabel: 'Active',
  },
  workspaces: [],
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
};

const deadline = <T>(promise: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Bootstrap test read did not start')), 3_000);
    }),
  ]).finally(() => clearTimeout(timer));
};

describe('App bootstrap bounded admission and recovery (e2e)', () => {
  let app: INestApplication;
  let latest: jest.MockedFunction<ListReaderSummariesUseCase['execute']>;
  let authenticate: jest.MockedFunction<GetAuthSessionUseCase['execute']>;
  let sessions: Map<string, GetAuthSessionResult>;
  let pendingRequests: Promise<unknown>[];
  let releases: (() => void)[];

  beforeEach(async () => {
    pendingRequests = [];
    releases = [];
    sessions = new Map(['one', 'two', 'three'].map((name) => [name, sessionFor(name)]));
    latest = jest.fn().mockResolvedValue(ok({ items: [] }));
    authenticate = jest.fn(async ({ accessToken }) => {
      const session = sessions.get(accessToken ?? '');
      return session ? ok(session) : err(new DomainError('authorization.denied', 'Session required'));
    });
    const cache = new AppBootstrapReaderSummaryCache(
      new FixedClock(new Date('2026-11-27T00:00:00.000Z')),
      30_000,
      300_000,
      10,
      { maxActiveLoads: 2, maxBackgroundLoads: 1 },
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [AppBootstrapController],
      providers: [
        AppBootstrapReaderSummaryQuery,
        { provide: AppBootstrapReaderSummaryCache, useValue: cache },
        { provide: GetAuthSessionUseCase, useValue: { execute: authenticate } },
        { provide: ListReaderSummariesUseCase, useValue: { execute: latest } },
        { provide: ListReaderSummaryPeriodsUseCase, useValue: { execute: jest.fn().mockResolvedValue(ok({ items: [] })) } },
        { provide: APP_FILTER, useClass: DomainErrorFilter },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, '127.0.0.1');
  });

  afterEach(async () => {
    for (const release of releases) release();
    await Promise.allSettled(pendingRequests);
    await app.close();
  });

  const get = (token: string) => request(app.getHttpServer())
    .get('/app/bootstrap')
    .set('Authorization', `Bearer ${token}`)
    .timeout({ response: 3_000, deadline: 5_000 });

  const observe = <T>(promise: Promise<T>): Promise<T> => {
    pendingRequests.push(promise);
    void promise.catch(() => undefined);
    return promise;
  };

  it('returns the existing 429 problem on saturation and recovers after success and failure', async () => {
    type ReadResult = Awaited<ReturnType<ListReaderSummariesUseCase['execute']>>;
    const firstRead = deferred<ReadResult>();
    const secondRead = deferred<ReadResult>();
    const firstStarted = deferred<void>();
    const secondStarted = deferred<void>();
    releases.push(() => firstRead.resolve(ok({ items: [] })), () => secondRead.resolve(ok({ items: [] })));
    latest.mockImplementationOnce(async () => {
      firstStarted.resolve(undefined);
      return firstRead.promise;
    }).mockImplementationOnce(async () => {
      secondStarted.resolve(undefined);
      return secondRead.promise;
    });

    const first = observe(get('one').expect(200).then((response) => response));
    await deadline(firstStarted.promise);
    const second = observe(get('two').expect(500).then((response) => response));
    await deadline(secondStarted.promise);

    const busy = await get('three').expect(429);
    expect(busy.body).toMatchObject({
      code: 'operation.backpressure',
      status: 429,
      details: {},
    });
    expect(busy.headers['content-type']).toContain('application/problem+json');
    expect(latest).toHaveBeenCalledTimes(2);

    firstRead.resolve(ok({ items: [] }));
    const initial = await first;
    expect(initial.headers['cache-control']).toBe('private, no-store');
    expect(initial.body.readerSummaries).toMatchObject({
      tenantId: 'tenant-one',
      workspaceId: 'shared-workspace',
    });
    const recovered = await get('three').expect(200);
    expect(recovered.body.readerSummaries.tenantId).toBe('tenant-three');

    secondRead.reject(new Error('postgres://user:raw-password@host/database'));
    const failed = await second;
    expect(failed.body).toMatchObject({
      code: 'internal.unexpected',
      detail: 'Unexpected server error',
    });
    expect(JSON.stringify(failed.body)).not.toContain('raw-password');
    const retried = await get('two').expect(200);
    expect(retried.body.readerSummaries.tenantId).toBe('tenant-two');
    expect(latest).toHaveBeenCalledTimes(4);
    expect(authenticate).toHaveBeenCalledTimes(5);
  });

  it('isolates cached summaries while rechecking each session and honoring later denial', async () => {
    const first = await get('one').expect(200);
    const second = await get('two').expect(200);
    expect(first.body.readerSummaries.tenantId).toBe('tenant-one');
    expect(second.body.readerSummaries.tenantId).toBe('tenant-two');
    sessions.set('one', { ...sessionFor('one'), userLabel: 'Updated user label' });

    const cached = await get('one').expect(200);
    expect(cached.body.session.userLabel).toBe('Updated user label');
    expect(cached.body.readerSummaries.tenantId).toBe('tenant-one');
    sessions.delete('one');
    expect((await get('one').expect(403)).body).toMatchObject({ code: 'authorization.denied' });
    expect(latest).toHaveBeenCalledTimes(2);
    expect(authenticate).toHaveBeenCalledTimes(4);
  });
});
