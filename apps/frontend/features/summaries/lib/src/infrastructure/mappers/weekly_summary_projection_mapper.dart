import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/weekly_summary_projection.dart';
import '../../domain/entities/weekly_summary_artifact.dart';
import '../../domain/value_objects/weekly_summary_evidence_limitation.dart';
import '../../domain/value_objects/weekly_summary_week.dart';
import 'weekly_summary_artifact_mapper.dart';

final class WeeklySummaryProjectionMapper {
  const WeeklySummaryProjectionMapper({
    WeeklySummaryArtifactMapper artifactMapper =
        const WeeklySummaryArtifactMapper(),
  }) : _artifactMapper = artifactMapper;

  static const _projectionSchema = 'reader_summary.weekly_projection.v1';

  final WeeklySummaryArtifactMapper _artifactMapper;

  Result<WeeklySummaryProjection> toDomain(
    generated.ReaderSummaryWeeklyProjectionResponseDto dto, {
    required WorkspaceScope scope,
    required WeeklySummaryWeek requestedWeek,
  }) {
    if (dto.schemaVersion.toJson() != _projectionSchema) {
      return _invalid('summaries.weekly_schema_unsupported');
    }
    if (dto.tenantId != scope.tenantId || dto.workspaceId != scope.workspaceId) {
      return _invalid('summaries.weekly_scope_mismatch');
    }
    if (dto.weekStartedOn != requestedWeek.startedOnIso ||
        dto.weekEndedOn != requestedWeek.endedOnIso) {
      return _invalid('summaries.weekly_window_mismatch');
    }

    final status = _statusFrom(dto.status.toJson());
    if (status == null) {
      return _invalid('summaries.weekly_status_unsupported');
    }
    final blockingReasons = _blockingReasonsFrom(dto.blockingReasons);
    if (blockingReasons == null) {
      return _invalid('summaries.weekly_blocking_reason_unsupported');
    }

    final evidenceLimitations = <WeeklySummaryEvidenceLimitation>[];
    for (final limitationDto in dto.evidenceLimitations) {
      final mapped = WeeklySummaryEvidenceLimitation.create(
        requestedUtcDate: limitationDto.requestedUtcDate,
        providerKey: limitationDto.providerKey.toJson(),
        evidenceState: limitationDto.evidenceState.toJson(),
      );
      if (mapped is ResultFailure<WeeklySummaryEvidenceLimitation>) {
        return Result.failure(mapped.failure);
      }
      evidenceLimitations.add(
        (mapped as ResultSuccess<WeeklySummaryEvidenceLimitation>).value,
      );
    }

    WeeklySummaryArtifact? artifact;
    final artifactDto = dto.artifact;
    if (status == WeeklySummaryProjectionStatus.complete &&
        artifactDto != null) {
      final mappedArtifact = _artifactMapper.toDomain(artifactDto, requestedWeek);
      if (mappedArtifact is ResultFailure<WeeklySummaryArtifact>) {
        return Result.failure(mappedArtifact.failure);
      }
      artifact = (mappedArtifact as ResultSuccess<WeeklySummaryArtifact>).value;
    }

    return WeeklySummaryProjection.create(
      status: status,
      scope: scope,
      week: requestedWeek,
      certifiedDailyEvidenceDates: dto.certifiedDailyEvidenceDates,
      missingDailyEvidenceDates: dto.missingDailyEvidenceDates,
      blockingReasons: blockingReasons,
      activeWeeklyCertifiedArtifactPresent:
          dto.activeWeeklyCertifiedArtifactPresent,
      evidenceLimitations: evidenceLimitations,
      artifact: artifact,
    );
  }

  WeeklySummaryProjectionStatus? _statusFrom(String value) => switch (value) {
    'complete' => WeeklySummaryProjectionStatus.complete,
    'partial' => WeeklySummaryProjectionStatus.partial,
    'unavailable' => WeeklySummaryProjectionStatus.unavailable,
    _ => null,
  };

  List<WeeklySummaryBlockingReason>? _blockingReasonsFrom(
    List<
      generated.ReaderSummaryWeeklyProjectionResponseDtoBlockingReasonsBlockingReasons
    > values,
  ) {
    final reasons = <WeeklySummaryBlockingReason>[];
    for (final value in values) {
      final reason = switch (value.toJson()) {
        'certified_daily_evidence_incomplete' =>
          WeeklySummaryBlockingReason.certifiedDailyEvidenceIncomplete,
        'active_weekly_certified_artifact_missing' =>
          WeeklySummaryBlockingReason.activeWeeklyCertifiedArtifactMissing,
        _ => null,
      };
      if (reason == null) {
        return null;
      }
      reasons.add(reason);
    }
    return reasons;
  }

  Result<WeeklySummaryProjection> _invalid(String code) => Result.failure(
    ValidationFailure(
      message: 'Weekly summary projection could not be verified.',
      code: code,
    ),
  );
}
