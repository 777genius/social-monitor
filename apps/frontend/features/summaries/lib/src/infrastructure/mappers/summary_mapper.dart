import '../../domain/entities/generated_summary.dart';
import '../../domain/entities/summary_citation.dart';
import '../../domain/value_objects/summary_generation_status.dart';
import '../../domain/value_objects/summary_id.dart';
import '../api/summary_api_dto.dart';

final class SummaryMapper {
  const SummaryMapper();

  GeneratedSummary toDomain(SummaryApiDto dto) {
    return GeneratedSummary(
      id: SummaryId(_nonEmpty(dto.id, fallback: 'summary-unknown')),
      title: _nonEmpty(dto.title, fallback: 'Untitled summary'),
      bodyPreview: _safeText(dto.bodyText, fallback: 'No summary available'),
      status: _statusFromApi(dto.status),
      citations: dto.citations.map(_citationToDomain).toList(growable: false),
      freshnessLabel: _nonEmpty(dto.freshnessLabel, fallback: 'Unknown'),
      feedbackSubmitted: dto.feedbackSubmitted,
    );
  }

  SummaryCitation _citationToDomain(SummaryCitationApiDto dto) {
    return SummaryCitation(
      id: _nonEmpty(dto.id, fallback: 'citation-unknown'),
      sourceLabel: _nonEmpty(dto.sourceLabel, fallback: 'Unknown source'),
      safeSnippet: _safeText(
        dto.rawSnippet,
        fallback: 'No citation snippet available',
      ),
    );
  }

  SummaryGenerationStatus _statusFromApi(String value) {
    return switch (value.trim().toLowerCase()) {
      'ready' => SummaryGenerationStatus.ready,
      'generating' => SummaryGenerationStatus.generating,
      'degraded' => SummaryGenerationStatus.degraded,
      'failed' => SummaryGenerationStatus.failed,
      _ => SummaryGenerationStatus.unknown,
    };
  }

  String _safeText(String raw, {required String fallback}) {
    final withoutSecrets = raw
        .replaceAll(RegExp(r'Bearer\s+[A-Za-z0-9._~+/=-]+'), '[redacted]')
        .replaceAll(RegExp(r'sk-[A-Za-z0-9_-]+'), '[redacted]')
        .replaceAll(RegExp(r'client_secret\s*[:=]\s*\S+'), '[redacted]');
    final singleLine = withoutSecrets.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (singleLine.isEmpty) {
      return fallback;
    }
    return singleLine.length <= 240
        ? singleLine
        : '${singleLine.substring(0, 237)}...';
  }

  String _nonEmpty(String? value, {required String fallback}) {
    final trimmed = value?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return fallback;
    }
    return trimmed;
  }
}
