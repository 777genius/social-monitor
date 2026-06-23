enum SourceReadinessState {
  researchOnly,
  profiled,
  certificationReady,
  enabledBeta,
  providerOnly,
  manualOnly,
  rejected,
  unknown;

  bool get isEnabled {
    return switch (this) {
      SourceReadinessState.certificationReady ||
      SourceReadinessState.enabledBeta => true,
      SourceReadinessState.researchOnly ||
      SourceReadinessState.profiled ||
      SourceReadinessState.providerOnly ||
      SourceReadinessState.manualOnly ||
      SourceReadinessState.rejected ||
      SourceReadinessState.unknown => false,
    };
  }
}
