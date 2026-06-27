enum SourceBindingHealthState {
  paused,
  notConfigured,
  scheduled,
  scanning,
  healthy,
  stale,
  degraded,
  down,
  unknown;

  bool get isHealthy => this == SourceBindingHealthState.healthy;
}
