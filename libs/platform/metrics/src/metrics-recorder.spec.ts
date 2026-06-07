import { InMemoryMetricsRecorder } from './metrics-recorder';

describe('InMemoryMetricsRecorder', () => {
  it('records counter increments with safe normalized labels', () => {
    const recorder = new InMemoryMetricsRecorder();

    recorder.incrementCounter({
      name: 'queue_commands_enqueued_total',
      labels: {
        command_type: 'ingestion.scan.execute',
        prompt: 'summarize https://example.com/private?token=secret',
        status: 'enqueued',
      },
    });
    recorder.incrementCounter({
      name: 'queue_commands_enqueued_total',
      value: 2,
      labels: {
        command_type: 'ingestion.scan.execute',
        prompt: 'another free-form label value',
        status: 'enqueued',
      },
    });

    expect(recorder.counters('queue_commands_enqueued_total')).toEqual([
      {
        name: 'queue_commands_enqueued_total',
        value: 1,
        labels: {
          command_type: 'ingestion.scan.execute',
          prompt: 'unknown',
          status: 'enqueued',
        },
      },
      {
        name: 'queue_commands_enqueued_total',
        value: 2,
        labels: {
          command_type: 'ingestion.scan.execute',
          prompt: 'unknown',
          status: 'enqueued',
        },
      },
    ]);
    expect(
      recorder.counterValue('queue_commands_enqueued_total', {
        command_type: 'ingestion.scan.execute',
        prompt: 'unsafe free form',
        status: 'enqueued',
      }),
    ).toBe(3);
  });
});
