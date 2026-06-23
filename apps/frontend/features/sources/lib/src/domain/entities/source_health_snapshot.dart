import '../value_objects/source_id.dart';

final class SourceHealthSnapshot {
  const SourceHealthSnapshot({
    required this.sourceId,
    required this.summary,
    required this.checkedAtLabel,
    required this.issueCount,
  });

  final SourceId sourceId;
  final String summary;
  final String checkedAtLabel;
  final int issueCount;
}
