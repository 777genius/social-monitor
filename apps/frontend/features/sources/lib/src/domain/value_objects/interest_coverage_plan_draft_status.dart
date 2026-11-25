enum InterestCoveragePlanDraftStatus {
  ready,
  needsInput,
  alreadyBound,
  unsupported,
  unknown;

  bool get canApply => this == InterestCoveragePlanDraftStatus.ready;
}
