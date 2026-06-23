import '../value_objects/credential_health.dart';
import '../value_objects/provider_capability.dart';
import '../value_objects/source_collection_status.dart';
import '../value_objects/source_id.dart';

final class SourceSummary {
  const SourceSummary({
    required this.id,
    required this.name,
    required this.credentialHealth,
    required this.healthLabel,
    required this.capability,
    required this.collectionStatus,
  });

  final SourceId id;
  final String name;
  final CredentialHealth credentialHealth;
  final String healthLabel;
  final ProviderCapability capability;
  final SourceCollectionStatus collectionStatus;
}
