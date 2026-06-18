import { FixedClock, type IdGenerator } from '@social-monitor/shared-kernel';

import { WorkerCommandIdFactory } from './worker-command-id-factory';

class SequenceIdGenerator implements IdGenerator {
  private nextValue = 1;

  generate(): string {
    const value = this.nextValue;
    this.nextValue += 1;
    return `id-${value}`;
  }
}

describe('WorkerCommandIdFactory', () => {
  it('creates deterministic monotonic ids from injected clock and id generator', () => {
    const factory = new WorkerCommandIdFactory(
      new FixedClock(new Date('2026-06-18T00:00:00.000Z')),
      new SequenceIdGenerator(),
    );

    expect(factory.next('scan-scheduler', ['startup'])).toBe('scan-scheduler:startup:1781740800000:0:id-1');
    expect(factory.next('scan-scheduler', ['interval'])).toBe('scan-scheduler:interval:1781740800000:1:id-2');
  });
});
