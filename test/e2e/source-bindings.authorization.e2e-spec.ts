import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('Source binding workspace authorization (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires an owner or admin workspace role to create source bindings', async () => {
    const tenant = tenantId('tenant-source-binding-authorization-e2e');
    const workspace = workspaceId('workspace-source-binding-authorization-e2e');
    const topic = await request(app.getHttpServer())
      .post('/interests')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'owner')
      .set('x-request-id', 'source-binding-auth-topic')
      .set('idempotency-key', 'source-binding-auth-topic')
      .send({
        name: 'Source binding auth topic',
        query: 'source binding auth topic',
      })
      .expect(201);

    const missingRole = await request(app.getHttpServer())
      .post(`/interests/${topic.body.interestId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-request-id', 'source-binding-auth-missing-role')
      .set('idempotency-key', 'source-binding-auth-missing-role')
      .send({
        providerKey: 'fake-source',
        config: { query: 'missing role source binding' },
      })
      .expect(403);

    expect(missingRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'source_bindings.create',
      },
    });

    const viewer = await request(app.getHttpServer())
      .post(`/interests/${topic.body.interestId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .set('x-request-id', 'source-binding-auth-viewer')
      .set('idempotency-key', 'source-binding-auth-viewer')
      .send({
        providerKey: 'fake-source',
        config: { query: 'viewer source binding' },
      })
      .expect(403);

    expect(viewer.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is not allowed for this action',
      details: {
        action: 'source_bindings.create',
        requiredRoles: ['owner', 'admin'],
      },
    });

    const owner = await request(app.getHttpServer())
      .post(`/interests/${topic.body.interestId}/source-bindings`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'owner')
      .set('x-request-id', 'source-binding-auth-owner')
      .set('idempotency-key', 'source-binding-auth-owner')
      .send({
        providerKey: 'fake-source',
        config: { query: 'owner source binding' },
      })
      .expect(201);

    expect(owner.body).toEqual({
      sourceBindingId: expect.any(String),
      created: true,
    });

    const missingReadRole = await request(app.getHttpServer())
      .get(`/interests/${topic.body.interestId}/source-bindings/overview`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(403);

    expect(missingReadRole.body).toMatchObject({
      code: 'authorization.denied',
      detail: 'Workspace role is required',
      details: {
        action: 'source_bindings.read',
      },
    });
    await request(app.getHttpServer())
      .get(`/interests/${topic.body.interestId}/source-bindings/daily-history`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .expect(403)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 'authorization.denied',
          details: {
            action: 'source_bindings.read',
          },
        });
      });

    const overview = await request(app.getHttpServer())
      .get(`/interests/${topic.body.interestId}/source-bindings/overview`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    expect(overview.body.items).toEqual([
      expect.objectContaining({
        sourceBinding: expect.objectContaining({
          id: owner.body.sourceBindingId,
        }),
      }),
    ]);

    await request(app.getHttpServer())
      .get(`/interests/${topic.body.interestId}/source-bindings/daily-history`)
      .query({ days: 2, providerKey: 'fake-source' })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          interestId: topic.body.interestId,
          summary: {
            sourceBindingCount: 1,
            enabledSourceBindingCount: 1,
            pausedSourceBindingCount: 0,
            configuredSourceBindingCount: 0,
            unconfiguredSourceBindingCount: 1,
            scannedSourceBindingCount: 0,
            unscannedSourceBindingCount: 1,
            scanCoverageState: 'none_scanned',
            totalScans: 0,
            providerBreakdown: [
              expect.objectContaining({
                providerKey: 'fake-source',
                sourceBindingCount: 1,
                enabledSourceBindingCount: 1,
                pausedSourceBindingCount: 0,
                configuredSourceBindingCount: 0,
                unconfiguredSourceBindingCount: 1,
                scannedSourceBindingCount: 0,
                unscannedSourceBindingCount: 1,
                scanCoverageState: 'none_scanned',
              }),
            ],
          },
          days: [
            expect.objectContaining({
              scannedSourceBindingCount: 0,
              unscannedSourceBindingCount: 1,
              scanCoverageState: 'none_scanned',
              totalScans: 0,
            }),
            expect.objectContaining({
              scannedSourceBindingCount: 0,
              unscannedSourceBindingCount: 1,
              scanCoverageState: 'none_scanned',
              totalScans: 0,
            }),
          ],
        });
      });

    await request(app.getHttpServer())
      .get(`/interests/${topic.body.interestId}/source-bindings/daily-history`)
      .query({ days: 2, providerKey: 'rss' })
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'viewer')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          interestId: topic.body.interestId,
          summary: {
            sourceBindingCount: 0,
            enabledSourceBindingCount: 0,
            pausedSourceBindingCount: 0,
            configuredSourceBindingCount: 0,
            unconfiguredSourceBindingCount: 0,
            scannedSourceBindingCount: 0,
            unscannedSourceBindingCount: 0,
            scanCoverageState: 'no_sources',
            totalScans: 0,
            providerBreakdown: [],
          },
          days: [
            expect.objectContaining({
              scannedSourceBindingCount: 0,
              unscannedSourceBindingCount: 0,
              scanCoverageState: 'no_sources',
              totalScans: 0,
              providerBreakdown: [],
            }),
            expect.objectContaining({
              scannedSourceBindingCount: 0,
              unscannedSourceBindingCount: 0,
              scanCoverageState: 'no_sources',
              totalScans: 0,
              providerBreakdown: [],
            }),
          ],
          maxScanJobs: 0,
        });
      });
  });
});
