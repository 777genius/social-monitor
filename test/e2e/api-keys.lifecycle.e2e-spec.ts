import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { VerifyApiKeyUseCase } from '@social-monitor/identity/features/verify-api-key/verify-api-key.use-case';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { InMemoryPublicApiAuditLog } from '@social-monitor/usage/adapters/audit/in-memory-public-api-audit-log';
import request from 'supertest';

import { AppModule } from '../../apps/api-gateway/src/app.module';

describe('API key lifecycle and scopes (e2e)', () => {
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

  it('creates show-once API key secret, enforces scopes and rejects revoked key', async () => {
    const tenant = tenantId('tenant-api-key-e2e');
    const workspace = workspaceId('workspace-api-key-e2e');
    const created = await request(app.getHttpServer())
      .post('/identity/api-keys')
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .send({
        name: 'Readonly summaries key',
        scopes: ['read:summaries'],
      })
      .expect(201);

    expect(created.body).toMatchObject({
      apiKey: {
        tenantId: tenant,
        workspaceId: workspace,
        name: 'Readonly summaries key',
        scopes: ['read:summaries'],
        status: 'active',
        keyPrefix: expect.any(String),
        createdAt: expect.any(String),
      },
      secret: expect.stringMatching(/^smk_/),
    });
    expect(created.body.apiKey.secretHash).toBeUndefined();

    const secret = created.body.secret as string;
    const verified = await app.get(VerifyApiKeyUseCase).execute({
      secret,
      requiredScope: 'read:summaries',
    });

    expect(verified).toEqual({
      ok: true,
      value: {
        apiKey: created.body.apiKey,
      },
    });

    const forbidden = await app.get(VerifyApiKeyUseCase).execute({
      secret,
      requiredScope: 'write:webhook_endpoints',
    });

    expect(forbidden).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'authorization.denied',
      }),
    });

    const revoked = await request(app.getHttpServer())
      .delete(`/identity/api-keys/${created.body.apiKey.id}`)
      .set('x-tenant-id', tenant)
      .set('x-workspace-id', workspace)
      .set('x-workspace-role', 'admin')
      .expect(200);

    expect(revoked.body).toMatchObject({
      id: created.body.apiKey.id,
      status: 'revoked',
      revokedAt: expect.any(String),
    });

    const auditRecords = await app.get(InMemoryPublicApiAuditLog).list({
      tenantId: tenant,
      workspaceId: workspace,
      limit: 10,
    });

    expect(auditRecords.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actorType: 'system',
        actorId: 'identity.api-keys',
        action: 'api_key.created',
        outcome: 'succeeded',
        resourceType: 'api_key',
        resourceId: created.body.apiKey.id,
      }),
      expect.objectContaining({
        actorType: 'system',
        actorId: 'identity.api-keys',
        action: 'api_key.revoked',
        outcome: 'succeeded',
        resourceType: 'api_key',
        resourceId: created.body.apiKey.id,
      }),
    ]));
    expect(JSON.stringify(auditRecords.records)).not.toContain(secret);

    await expect(app.get(VerifyApiKeyUseCase).execute({
      secret,
      requiredScope: 'read:summaries',
    })).resolves.toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'authorization.denied',
      }),
    });
  });
});
