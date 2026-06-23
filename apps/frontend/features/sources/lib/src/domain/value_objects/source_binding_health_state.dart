enum SourceBindingHealthState {
  paused,
  notConfigured,
  scheduled,
  scanning,
  healthy,
  stale,
  degraded,
  unknown;

  bool get isHealthy => this == SourceBindingHealthState.healthy;
}
