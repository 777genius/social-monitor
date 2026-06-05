import type { FailedScanCommand, RetryScanCommand, ScanFailureQueuePort } from '../../ports';

export class InMemoryScanFailureQueueAdapter implements ScanFailureQueuePort {
  private readonly retryCommands: RetryScanCommand[] = [];
  private readonly deadLetters: FailedScanCommand[] = [];

  async enqueueRetry(command: RetryScanCommand): Promise<void> {
    this.retryCommands.push(command);
  }

  async deadLetter(command: FailedScanCommand): Promise<void> {
    this.deadLetters.push(command);
  }

  retries(): readonly RetryScanCommand[] {
    return [...this.retryCommands];
  }

  deadLettered(): readonly FailedScanCommand[] {
    return [...this.deadLetters];
  }
}
