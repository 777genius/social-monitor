enum ScanUserState {
  scanPending,
  scanInProgress,
  contentCurrent,
  scanDegraded,
  unknown,
}

ScanUserState scanUserStateFromApi(String value) {
  return switch (value) {
    'scan_pending' => ScanUserState.scanPending,
    'scan_in_progress' => ScanUserState.scanInProgress,
    'content_current' => ScanUserState.contentCurrent,
    'scan_degraded' => ScanUserState.scanDegraded,
    _ => ScanUserState.unknown,
  };
}
