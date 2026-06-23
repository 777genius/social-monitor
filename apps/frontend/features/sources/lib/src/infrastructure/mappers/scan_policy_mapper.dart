import '../../domain/entities/scan_policy.dart';
import '../../domain/value_objects/scan_policy_id.dart';
import '../../domain/value_objects/source_binding_id.dart';
import '../api/scan_policy_api_dto.dart';

final class ScanPolicyMapper {
  const ScanPolicyMapper();

  ScanPolicy toDomain(ScanPolicyApiDto dto) {
    return ScanPolicy(
      id: ScanPolicyId(dto.id),
      sourceBindingId: SourceBindingId(dto.sourceBindingId),
      intervalSeconds: dto.intervalSeconds.toInt(),
      freshnessSeconds: dto.freshnessSeconds.toInt(),
      retryBudget: dto.retryBudget.toInt(),
      nextRunAt: dto.nextRunAt,
      createdAt: dto.createdAt,
    );
  }
}
