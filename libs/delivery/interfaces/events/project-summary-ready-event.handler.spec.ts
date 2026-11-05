import { InMemoryMetricsRecorder } from '@social-monitor/platform-metrics';
import { WorkerRuntime } from '@social-monitor/platform-worker';
import type { ProjectSummaryReadyEventUseCase } from '../../features/project-summary-ready-event/project-summary-ready-event.use-case';
import { ProjectSummaryReadyEventHandler } from './project-summary-ready-event.handler';

describe('ProjectSummaryReadyEventHandler parsing', () => {
  it('rejects malformed scope, schema, and payload before calling the use case', async () => {
    const execute = jest.fn();
    const runtime = new WorkerRuntime({ serviceName: 'summary-ready-parser-fixture' });
    runtime.onModuleInit();
    const handler = new ProjectSummaryReadyEventHandler(
      { execute } as unknown as ProjectSummaryReadyEventUseCase, new InMemoryMetricsRecorder(), runtime);
    const input = { eventId: 'fixture-event', eventType: 'summary.ready', schemaVersion: 1,
      occurredAt: '2026-09-23T00:00:00.000Z', tenantId: 'a4574ba2-335c-425e-8770-7479dd62ec08',
      workspaceId: 'ae382b79-709d-45a1-9a8c-a6603e9bcf53',
      correlationId: 'fixture-correlation', causationId: 'fixture-cause',
      payload: { tenantId: 'a4574ba2-335c-425e-8770-7479dd62ec08',
        workspaceId: 'ae382b79-709d-45a1-9a8c-a6603e9bcf53',
        interestId: 'fixture-interest', summaryJobId: 'fixture-job', summaryId: 'fixture-summary', status: 'completed' } };
    try {
      for (const changed of [
        { ...input, schemaVersion: 2 },
        { ...input, workspaceId: 'different-workspace' },
        { ...input, payload: { ...input.payload, status: 'invalid' } },
        { ...input, occurredAt: 'invalid-date' },
        { ...input, payload: { ...input.payload, summaryId: 42 } },
      ]) {
        await expect(handler.handle(changed)).rejects.toThrow();
      }
      expect(execute).not.toHaveBeenCalled();
      execute.mockResolvedValue({ ok: true, value: { realtimeEventId: 'fixture-realtime', channel: 'fixture-channel', sequence: 1 } });
      await handler.handle({ ...input, payload: { ...input.payload, userId: 'fixture-user', futureField: { value: 1 } } });
      expect(execute).toHaveBeenCalledWith({ event: expect.objectContaining({
        payload: expect.objectContaining({ userId: 'fixture-user', futureField: { value: 1 } }),
      }) });
    } finally {
      await runtime.onApplicationShutdown('fixture complete');
    }
  });
});
