import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { SummaryRestModule } from '@social-monitor/summary/interfaces/rest/summary-rest.module';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { DomainErrorFilter } from '../apps/api-gateway/src/domain-error.filter';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

async function main(): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [SummaryRestModule],
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

  try {
    const tenant = tenantId('tenant-summary-policy-rest-smoke');
    const otherTenant = tenantId('tenant-summary-policy-rest-other');
    const workspace = workspaceId('workspace-summary-policy-rest-smoke');
    const topicId = 'topic-summary-policy-rest-smoke';
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
    };
    const otherTenantHeaders = {
      ...headers,
      'x-tenant-id': otherTenant,
    };

    const defaultPolicy = await request(app.getHttpServer())
      .get(`/topics/${topicId}/summary-policy`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(defaultPolicy.body.source === 'default', 'summary policy REST must return default source first');
    assert(defaultPolicy.body.policy.format === 'executive_brief', 'default summary policy must be executive_brief');

    await request(app.getHttpServer())
      .put(`/topics/${topicId}/summary-policy`)
      .set(headers)
      .set('x-workspace-role', 'member')
      .send({
        language: 'ru',
        format: 'bullet_digest',
        tone: 'analytical',
        maxKeyPoints: 7,
        includeRisks: true,
        includeSourceHighlights: false,
        customInstructions: 'Track launch, pricing and reliability signals.',
      })
      .expect(403);

    const upserted = await request(app.getHttpServer())
      .put(`/topics/${topicId}/summary-policy`)
      .set(headers)
      .set('x-workspace-role', 'admin')
      .send({
        language: 'ru',
        format: 'bullet_digest',
        tone: 'analytical',
        maxKeyPoints: 7,
        includeRisks: true,
        includeSourceHighlights: false,
        customInstructions: 'Track launch, pricing and reliability signals.',
      })
      .expect(200);

    assert(upserted.body.created === true, 'summary policy REST first upsert must create policy');
    assert(upserted.body.policy.language === 'ru', 'summary policy REST must persist language');
    assert(upserted.body.policy.maxKeyPoints === 7, 'summary policy REST must persist max key points');
    assert(upserted.body.policy.includeSourceHighlights === false, 'summary policy REST must persist highlights flag');

    await request(app.getHttpServer())
      .put(`/topics/${topicId}/summary-policy`)
      .set(otherTenantHeaders)
      .set('x-workspace-role', 'admin')
      .send({
        language: 'en',
        format: 'risk_brief',
        tone: 'concise',
        maxKeyPoints: 3,
        includeRisks: true,
        includeSourceHighlights: true,
        customInstructions: 'Track reliability risk only.',
      })
      .expect(200);

    const stored = await request(app.getHttpServer())
      .get(`/topics/${topicId}/summary-policy`)
      .set(headers)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(stored.body.source === 'stored', 'summary policy REST must return stored source after upsert');
    assert(
      stored.body.policy.customInstructions === 'Track launch, pricing and reliability signals.',
      'summary policy REST must preserve custom instructions',
    );

    const otherTenantStored = await request(app.getHttpServer())
      .get(`/topics/${topicId}/summary-policy`)
      .set(otherTenantHeaders)
      .set('x-workspace-role', 'viewer')
      .expect(200);

    assert(
      otherTenantStored.body.policy.customInstructions === 'Track reliability risk only.',
      'summary policy REST must keep same topic ids isolated by tenant',
    );

    await request(app.getHttpServer())
      .put(`/topics/${topicId}/summary-policy`)
      .set(headers)
      .set('x-workspace-role', 'admin')
      .send({
        language: 'en',
        format: 'risk_brief',
        tone: 'concise',
        maxKeyPoints: 0,
        includeRisks: true,
        includeSourceHighlights: true,
      })
      .expect(400);

    console.log('Summary policy REST smoke OK');
  } finally {
    await app.close();
  }
}

void main();
