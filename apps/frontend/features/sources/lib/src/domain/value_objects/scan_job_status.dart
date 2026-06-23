enum ScanJobStatus {
  requested,
  enqueued,
  succeeded,
  failed,
  unknown;

  bool get isTerminal {
    return switch (this) {
      ScanJobStatus.succeeded || ScanJobStatus.failed => true,
      ScanJobStatus.requested ||
      ScanJobStatus.enqueued ||
      ScanJobStatus.unknown => false,
    };
  }
}

ScanJobStatus scanJobStatusFromApi(String value) {
  return switch (value) {
    'requested' => ScanJobStatus.requested,
    'enqueued' => ScanJobStatus.enqueued,
    'succeeded' => ScanJobStatus.succeeded,
    'failed' => ScanJobStatus.failed,
    _ => ScanJobStatus.unknown,
  };
}
