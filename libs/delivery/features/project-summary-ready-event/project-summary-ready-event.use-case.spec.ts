import { causationId, correlationId, eventId, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { RealtimeEvent } from '../../domain';
import type { SummaryReadyProjection } from '../../application/contracts/summary-ready-projection-store';
import { ProjectSummaryReadyEventUseCase } from './project-summary-ready-event.use-case';

describe('ProjectSummaryReadyEventUseCase', () => {
  const event = {
    eventId: eventId('summary-ready-event-1'), eventType: 'summary.ready', schemaVersion: 1,
    occurredAt: new Date('2026-09-23T00:00:00.000Z'), tenantId: tenantId('tenant-1'),
    workspaceId: workspaceId('workspace-1'), correlationId: correlationId('correlation-1'),
    causationId: causationId('summary-job-1'), payload: { tenantId: tenantId('tenant-1'),
      workspaceId: workspaceId('workspace-1'), interestId: 'interest-1', summaryJobId: 'summary-job-1',
      summaryId: 'summary-1', status: 'completed' as const },
  };

  it('maps a valid summary event to the delivery projection contract and fanout', async () => {
    const project = jest.fn(async (projection: SummaryReadyProjection) => {
      const { sourceEventId, sourceIdentityHash, ...props } = projection;
      expect(sourceEventId).toBe(event.eventId);
      expect(sourceIdentityHash).toMatch(/^[a-f0-9]{64}$/);
      return RealtimeEvent.create({ ...props, id: 'realtime-1', sequence: 1, replayCursor: 'v1:1' });
    });
    const publish = jest.fn(async () => undefined);
    const result = await new ProjectSummaryReadyEventUseCase({ project }, { publish }).execute({ event });
    expect(result).toMatchObject({ ok: true, value: { realtimeEventId: 'realtime-1', sequence: 1 } });
    expect(project).toHaveBeenCalledWith({ sourceEventId: event.eventId,
      sourceIdentityHash: expect.stringMatching(/^[a-f0-9]{64}$/), protocolVersion: 1,
      eventType: 'summary.status.changed.v1', tenantId: event.tenantId, workspaceId: event.workspaceId,
      channel: 'interest:interest-1:summary-status', resourceType: 'summary', resourceId: 'summary-1',
      correlationId: event.correlationId, occurredAt: event.occurredAt,
      payload: { summaryJobId: 'summary-job-1', summaryId: 'summary-1', tenantId: event.tenantId,
        workspaceId: event.workspaceId, interestId: 'interest-1', status: 'completed' } });
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ toSnapshot: expect.any(Function) }));
  });

  it('returns typed validation failures without touching persistence', async () => {
    const project = jest.fn();
    const useCase = new ProjectSummaryReadyEventUseCase({ project }, { publish: jest.fn() });
    for (const changed of [
      { ...event, eventType: 'other.ready' },
      { ...event, schemaVersion: 2 },
      { ...event, tenantId: tenantId('different') },
      { ...event, workspaceId: workspaceId('different') },
      { ...event, payload: { ...event.payload, status: 'invalid' as 'completed' } },
      { ...event, occurredAt: new Date('invalid') },
    ]) {
      expect(await useCase.execute({ event: changed })).toMatchObject({ ok: false, error: { code: 'validation.failed' } });
    }
    expect(project).not.toHaveBeenCalled();
  });
});
