enum SourceBindingHealthState {
  paused,
  notConfigured,
  scheduled,
  scanning,
  healthy,
  stale,
  rateLimited,
  authFailed,
  degraded,
  unsupportedScope,
  down,
  unknown;

  bool get isHealthy => this == SourceBindingHealthState.healthy;
}
