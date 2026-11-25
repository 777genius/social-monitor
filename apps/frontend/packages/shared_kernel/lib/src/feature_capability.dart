final class FeatureCapability {
  const FeatureCapability({
    required this.key,
    required this.isEnabled,
    this.disabledReasonCode,
  });

  final String key;
  final bool isEnabled;
  final String? disabledReasonCode;

  bool get isDisabled => !isEnabled;
}

final class FeatureFlagSet {
  const FeatureFlagSet(this.capabilities);

  final Map<String, FeatureCapability> capabilities;

  FeatureCapability capability(String key) {
    return capabilities[key] ??
        FeatureCapability(
          key: key,
          isEnabled: false,
          disabledReasonCode: 'capability_missing',
        );
  }
}
