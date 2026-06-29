import { ValidationPipe } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL,
} from '@social-monitor/monitoring/interfaces/rest/monitoring-provider-tokens';
import { MonitoringRestModule } from '@social-monitor/monitoring/interfaces/rest/monitoring-rest.module';
import type {
  FindScanExecutionAttemptQuery,
  ScanExecutionAttemptReadPort,
  ScanExecutionAttemptSnapshot,
} from '@social-monitor/monitoring/ports';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import request from 'supertest';

import { DomainErrorFilter } from '../apps/api-gateway/src/domain-error.filter';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

class SeededScanExecutionAttempts implements ScanExecutionAttemptReadPort {
  private attempt: ScanExecutionAttemptSnapshot | null = null;

  seed(attempt: ScanExecutionAttemptSnapshot): void {
    this.attempt = attempt;
  }

  async findLatestByScanJob(query: FindScanExecutionAttemptQuery): Promise<ScanExecutionAttemptSnapshot | null> {
    if (this.attempt === null) {
      return null;
    }

    if (
      this.attempt.tenantId !== query.tenantId ||
      this.attempt.workspaceId !== query.workspaceId ||
      this.attempt.scanJobId !== query.scanJobId
    ) {
      return null;
    }

    return this.attempt;
  }
}

async function main(): Promise<void> {
  const attempts = new SeededScanExecutionAttempts();
  const moduleRef = await Test.createTestingModule({
    imports: [MonitoringRestModule],
    providers: [
      {
        provide: APP_FILTER,
        useClass: DomainErrorFilter,
      },
    ],
  })
    .overrideProvider(MONITORING_SCAN_EXECUTION_ATTEMPT_READ_MODEL)
    .useValue(attempts)
    .compile();
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
    const tenant = tenantId('tenant-scan-status-attempt-rest-smoke');
    const workspace = workspaceId('workspace-scan-status-attempt-rest-smoke');
    const headers = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspace,
      'x-workspace-role': 'admin',
    };
    const otherWorkspaceHeaders = {
      'x-tenant-id': tenant,
      'x-workspace-id': workspaceId('workspace-scan-status-attempt-rest-smoke-other'),
      'x-workspace-role': 'admin',
    };
    const otherTenantHeaders = {
      'x-tenant-id': tenantId('tenant-scan-status-attempt-rest-smoke-other'),
      'x-workspace-id': workspace,
      'x-workspace-role': 'admin',
    };

    const topic = await request(app.getHttpServer())
      .post('/interests')
      .set(headers)
      .set('idempotency-key', 'topic')
      .send({
        name: 'Operational Scan Status',
        query: 'scan attempt counters',
      })
      .expect(201);

    const binding = await request(app.getHttpServer())
      .post(`/interests/${topic.body.interestId}/source-bindings`)
      .set(headers)
      .set('idempotency-key', 'binding')
      .send({
        providerKey: 'fake-source',
        config: { mode: 'search', query: 'observability' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-policy`)
      .set(headers)
      .set('idempotency-key', 'policy')
      .send({
        intervalSeconds: 300,
        freshnessSeconds: 900,
        retryBudget: 3,
      })
      .expect(201);

    const scan = await request(app.getHttpServer())
      .post(`/source-bindings/${binding.body.sourceBindingId}/scan-requests`)
      .set(headers)
      .set('idempotency-key', 'scan')
      .expect(201);

    attempts.seed({
      tenantId: tenant,
      workspaceId: workspace,
      scanJobId: scan.body.scanJobId,
      sourceBindingId: binding.body.sourceBindingId,
      status: 'succeeded',
      startedAt: new Date('2026-06-16T00:00:01.000Z'),
      finishedAt: new Date('2026-06-16T00:00:03.000Z'),
      fetched: 12,
      inserted: 9,
      skippedDuplicates: 2,
      projected: 9,
    });

    const status = await request(app.getHttpServer())
      .get(`/scan-requests/${scan.body.scanJobId}/status`)
      .set(headers)
      .expect(200);

    assert(status.body.latestAttempt.status === 'succeeded', 'scan status must expose latest attempt status');
    assert(status.body.latestAttempt.fetched === 12, 'scan status must expose fetched counter');
    assert(status.body.latestAttempt.inserted === 9, 'scan status must expose inserted counter');
    assert(
      status.body.latestAttempt.startedAt === '2026-06-16T00:00:01.000Z',
      'scan status must serialize attempt timestamps',
    );

    await request(app.getHttpServer())
      .get(`/scan-requests/${scan.body.scanJobId}/status`)
      .set(otherWorkspaceHeaders)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/scan-requests/${scan.body.scanJobId}/status`)
      .set(otherTenantHeaders)
      .expect(404);

    console.log('Scan status attempt REST smoke OK');
  } finally {
    await app.close();
  }
}

void main();
