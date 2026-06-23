enum SourceBindingStatus {
  enabled,
  paused,
  unknown;

  bool get canPause => this == SourceBindingStatus.enabled;

  bool get canResume => this == SourceBindingStatus.paused;
}
