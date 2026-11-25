enum ScanFailureClass {
  providerUnavailable,
  providerRateLimited,
  providerAuthFailed,
  workerConflict,
  systemFailure,
  unknown,
}

ScanFailureClass? scanFailureClassFromApi(String? value) {
  return switch (value) {
    null => null,
    'provider_unavailable' => ScanFailureClass.providerUnavailable,
    'provider_rate_limited' => ScanFailureClass.providerRateLimited,
    'provider_auth_failed' => ScanFailureClass.providerAuthFailed,
    'worker_conflict' => ScanFailureClass.workerConflict,
    'system_failure' => ScanFailureClass.systemFailure,
    _ => ScanFailureClass.unknown,
  };
}
