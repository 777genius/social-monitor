import {
  emptyQueueCommandDeliveryDiagnostics,
  queueCommandDeliveryLagSeconds,
  queueCommandDeliveryDiagnosticsFromRabbitMq,
} from './queue-delivery-diagnostics';

describe('queueCommandDeliveryDiagnosticsFromRabbitMq', () => {
  it('extracts redelivery and x-death diagnostics for the current queue', () => {
    const diagnostics = queueCommandDeliveryDiagnosticsFromRabbitMq({
      fields: {
        redelivered: true,
      },
      properties: {
        timestamp: 1781777730,
        headers: {
          'x-death': [
            {
              queue: 'other.queue',
              count: 9,
              reason: 'expired',
            },
            {
              queue: 'jobs.summary.execute',
              count: 2,
              reason: 'rejected',
            },
          ],
        },
      },
    }, 'jobs.summary.execute');

    expect(diagnostics).toEqual({
      redelivered: true,
      deadLetterCount: 2,
      deadLetterReason: 'rejected',
      deadLetterQueue: 'jobs.summary.execute',
      publishedAtEpochMs: 1781777730000,
    });
  });

  it('falls back to empty diagnostics when x-death is absent', () => {
    expect(queueCommandDeliveryDiagnosticsFromRabbitMq({
      fields: {
        redelivered: false,
      },
      properties: {
        headers: {},
      },
    }, 'jobs.summary.execute')).toEqual(emptyQueueCommandDeliveryDiagnostics);
  });

  it('calculates non-negative lag from RabbitMQ publish timestamp', () => {
    const diagnostics = queueCommandDeliveryDiagnosticsFromRabbitMq({
      properties: {
        timestamp: 1781777730,
      },
    }, 'jobs.summary.execute');

    expect(queueCommandDeliveryLagSeconds(
      diagnostics,
      new Date('2026-06-18T10:16:00.000Z'),
    )).toBe(30);
    expect(queueCommandDeliveryLagSeconds(
      diagnostics,
      new Date('2026-06-18T10:15:00.000Z'),
    )).toBe(0);
  });
});
