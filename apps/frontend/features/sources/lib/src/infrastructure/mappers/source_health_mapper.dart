import '../../domain/entities/source_health_snapshot.dart';
import '../../domain/value_objects/source_id.dart';
import '../api/source_health_api_dto.dart';

final class SourceHealthMapper {
  const SourceHealthMapper();

  SourceHealthSnapshot toDomain(SourceHealthApiDto dto) {
    return SourceHealthSnapshot(
      sourceId: SourceId(_nonEmpty(dto.sourceId, fallback: 'source-unknown')),
      summary: _safeSummary(dto.summary),
      checkedAtLabel: _nonEmpty(dto.checkedAtLabel, fallback: 'Not checked'),
      issueCount: (dto.issueCount).clamp(0, 1 << 31),
    );
  }

  String _safeSummary(String value) {
    final lower = value.toLowerCase();
    if (lower.contains('token') || lower.contains('oauth')) {
      return 'Credential details are hidden';
    }
    return _nonEmpty(value, fallback: 'No provider health details');
  }

  String _nonEmpty(String? value, {required String fallback}) {
    final trimmed = value?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return fallback;
    }
    return trimmed;
  }
}
