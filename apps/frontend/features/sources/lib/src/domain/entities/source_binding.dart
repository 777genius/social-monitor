import '../value_objects/source_binding_id.dart';
import '../value_objects/source_binding_status.dart';
import '../value_objects/source_interest_id.dart';
import '../value_objects/source_provider_key.dart';

final class SourceBinding {
  const SourceBinding({
    required this.id,
    required this.interestId,
    required this.providerKey,
    required this.capabilityProfileVersion,
    required this.status,
    required this.configPreview,
    required this.createdAt,
  });

  final SourceBindingId id;
  final SourceInterestId interestId;
  final SourceProviderKey providerKey;
  final num capabilityProfileVersion;
  final SourceBindingStatus status;
  final List<SourceBindingConfigPreviewItem> configPreview;
  final DateTime createdAt;

  String get displayTitle {
    final mode = configValue('mode');
    if (mode == null || mode.isEmpty) {
      return providerKey.normalized;
    }
    return '${providerKey.normalized} - $mode';
  }

  String? configValue(String key) {
    for (final item in configPreview) {
      if (item.key == key) {
        return item.value;
      }
    }
    return null;
  }
}

final class SourceBindingConfigPreviewItem {
  const SourceBindingConfigPreviewItem({
    required this.key,
    required this.value,
  });

  final String key;
  final String value;
}
