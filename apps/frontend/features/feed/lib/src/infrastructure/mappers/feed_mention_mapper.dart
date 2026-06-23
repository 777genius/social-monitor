import '../../domain/entities/feed_mention.dart';
import '../../domain/value_objects/mention_id.dart';
import '../../domain/value_objects/mention_sentiment.dart';
import '../../domain/value_objects/mention_triage_state.dart';
import '../api/feed_mention_api_dto.dart';

final class FeedMentionMapper {
  const FeedMentionMapper();

  FeedMention toDomain(FeedMentionApiDto dto) {
    return FeedMention(
      id: MentionId(_nonEmpty(dto.id, fallback: 'mention-unknown')),
      title: _nonEmpty(dto.title, fallback: 'Untitled mention'),
      sourceName: _nonEmpty(dto.sourceName, fallback: 'Unknown source'),
      sentiment: _sentimentFromApi(dto.sentiment),
      triageState: _triageFromApi(dto.triageState),
      safeEvidencePreview: _safePreview(dto.rawEvidenceText),
      provenanceLabel: _nonEmpty(dto.provenanceLabel, fallback: 'Redacted'),
    );
  }

  MentionSentiment _sentimentFromApi(String value) {
    return switch (value.trim().toLowerCase()) {
      'watch' => MentionSentiment.watch,
      'positive' => MentionSentiment.positive,
      'opportunity' => MentionSentiment.opportunity,
      _ => MentionSentiment.unknown,
    };
  }

  MentionTriageState _triageFromApi(String value) {
    return switch (value.trim().toLowerCase()) {
      'needs_triage' => MentionTriageState.needsTriage,
      'reviewed' => MentionTriageState.reviewed,
      'escalated' => MentionTriageState.escalated,
      _ => MentionTriageState.unknown,
    };
  }

  String _safePreview(String raw) {
    final withoutSecrets = raw
        .replaceAll(RegExp(r'Bearer\s+[A-Za-z0-9._~+/=-]+'), '[redacted]')
        .replaceAll(RegExp(r'sk-[A-Za-z0-9_-]+'), '[redacted]');
    final singleLine = withoutSecrets.replaceAll(RegExp(r'\s+'), ' ').trim();
    if (singleLine.isEmpty) {
      return 'No evidence preview available';
    }
    return singleLine.length <= 180
        ? singleLine
        : '${singleLine.substring(0, 177)}...';
  }

  String _nonEmpty(String? value, {required String fallback}) {
    final trimmed = value?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      return fallback;
    }
    return trimmed;
  }
}
