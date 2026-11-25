import '../value_objects/mention_id.dart';
import '../value_objects/mention_sentiment.dart';
import '../value_objects/mention_triage_state.dart';

final class FeedMention {
  const FeedMention({
    required this.id,
    required this.title,
    required this.sourceName,
    required this.sentiment,
    required this.triageState,
    required this.safeEvidencePreview,
    required this.provenanceLabel,
  });

  final MentionId id;
  final String title;
  final String sourceName;
  final MentionSentiment sentiment;
  final MentionTriageState triageState;
  final String safeEvidencePreview;
  final String provenanceLabel;
}
