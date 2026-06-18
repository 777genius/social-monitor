import {
  emptyQueueCommandDeliveryDiagnostics,
  queueCommandDeliveryDiagnosticsFromRabbitMq,
} from './queue-delivery-diagnostics';

describe('queueCommandDeliveryDiagnosticsFromRabbitMq', () => {
  it('extracts redelivery and x-death diagnostics for the current queue', () => {
    const diagnostics = queueCommandDeliveryDiagnosticsFromRabbitMq({
      fields: {
        redelivered: true,
      },
      properties: {
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
});
