enum SourceRuntimeReadiness {
  fixtureReady,
  liveBetaReady,
  deferred,
  unknown;

  bool get canCollect {
    return switch (this) {
      SourceRuntimeReadiness.fixtureReady ||
      SourceRuntimeReadiness.liveBetaReady => true,
      SourceRuntimeReadiness.deferred ||
      SourceRuntimeReadiness.unknown => false,
    };
  }
}
