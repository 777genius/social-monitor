final class ProviderCapability {
  const ProviderCapability({
    required this.key,
    required this.isEnabled,
    this.disabledReasonCode,
  });

  final String key;
  final bool isEnabled;
  final String? disabledReasonCode;
}
