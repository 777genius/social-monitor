import { CryptoIdGenerator, SystemClock, type Clock, type IdGenerator } from '@social-monitor/shared-kernel';

export class WorkerCommandIdFactory {
  private sequence = 0;

  static system(): WorkerCommandIdFactory {
    return new WorkerCommandIdFactory(new SystemClock(), new CryptoIdGenerator());
  }

  constructor(
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  next(prefix: string, parts: readonly string[] = []): string {
    const sequence = this.sequence;
    this.sequence += 1;

    return [
      prefix,
      ...parts,
      String(this.clock.now().getTime()),
      String(sequence),
      this.ids.generate(),
    ]
      .filter((part) => part.length > 0)
      .join(':');
  }
}
