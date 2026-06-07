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

  it('records gauges and returns the latest matching value', () => {
    const recorder = new InMemoryMetricsRecorder();

    recorder.recordGauge({
      name: 'queue_commands_backlog',
      value: 1,
      labels: {
        command_type: 'ingestion.scan.execute',
        queue: 'scan',
      },
    });
    recorder.recordGauge({
      name: 'queue_commands_backlog',
      value: 3,
      labels: {
        command_type: 'ingestion.scan.execute',
        queue: 'scan',
      },
    });

    expect(recorder.gauges('queue_commands_backlog')).toHaveLength(2);
    expect(
      recorder.latestGaugeValue('queue_commands_backlog', {
        command_type: 'ingestion.scan.execute',
        queue: 'scan',
      }),
    ).toBe(3);
  });
});
