enum ScanAttemptStatus { running, succeeded, failed, unknown }

ScanAttemptStatus scanAttemptStatusFromApi(String value) {
  return switch (value) {
    'running' => ScanAttemptStatus.running,
    'succeeded' => ScanAttemptStatus.succeeded,
    'failed' => ScanAttemptStatus.failed,
    _ => ScanAttemptStatus.unknown,
  };
}
