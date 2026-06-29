import '../../domain/entities/interest_summary.dart';
import '../../domain/value_objects/interest_id.dart';
import '../../domain/value_objects/interest_lifecycle_status.dart';
import '../../domain/value_objects/interest_name.dart';
import '../../domain/value_objects/interest_query.dart';
import '../api/interest_summary_api_dto.dart';

final class InterestSummaryMapper {
  const InterestSummaryMapper();

  InterestSummary toDomain(InterestSummaryApiDto dto) {
    return InterestSummary(
      id: InterestId(_nonEmpty(dto.id, fallback: 'interest-unknown')),
      name: InterestName(_nonEmpty(dto.name, fallback: 'Untitled interest')),
      query: InterestQuery(
        _nonEmpty(dto.query, fallback: 'No query available'),
      ),
      status: _statusFromApi(dto.status),
      weeklyMentionCount: (dto.weeklyMentionCount ?? 0).clamp(0, 1 << 31),
    );
  }

  InterestLifecycleStatus _statusFromApi(String value) {
    return switch (value.trim().toLowerCase()) {
      'active' => InterestLifecycleStatus.active,
      'draft' => InterestLifecycleStatus.draft,
      'archived' => InterestLifecycleStatus.archived,
      _ => InterestLifecycleStatus.unknown,
    };
  }

  String _nonEmpty(String? value, {required String fallback}) {
    final trimmed = value?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return fallback;
    }
    return trimmed;
  }
}
