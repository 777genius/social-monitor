enum ScanFailureClass {
  providerUnavailable,
  providerRateLimited,
  workerConflict,
  systemFailure,
  unknown,
}

ScanFailureClass? scanFailureClassFromApi(String? value) {
  return switch (value) {
    null => null,
    'provider_unavailable' => ScanFailureClass.providerUnavailable,
    'provider_rate_limited' => ScanFailureClass.providerRateLimited,
    'worker_conflict' => ScanFailureClass.workerConflict,
    'system_failure' => ScanFailureClass.systemFailure,
    _ => ScanFailureClass.unknown,
  };
}
