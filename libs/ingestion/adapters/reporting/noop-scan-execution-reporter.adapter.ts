import type { ScanExecutionReporterPort } from '../../ports';

export class NoopScanExecutionReporterAdapter implements ScanExecutionReporterPort {
  reportSucceeded: ScanExecutionReporterPort['reportSucceeded'] = async () => {
    return undefined;
  };

  reportFailed: ScanExecutionReporterPort['reportFailed'] = async () => {
    return undefined;
  };
}
