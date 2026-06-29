import '../aggregates/reader_summary.dart';

const supportedReaderFeedbackActionKinds = {
  'mark_relevant',
  'mark_not_relevant',
};

enum ReaderFeedbackReason {
  notSameStory('not_same_story', 'Not same story'),
  duplicate('duplicate', 'Duplicate'),
  lowQualitySource('low_quality_source', 'Low quality source'),
  overratedProvider('overrated_provider', 'Overrated provider');

  const ReaderFeedbackReason(this.apiValue, this.label);

  final String apiValue;
  final String label;
}

final class ReaderActionTarget {
  const ReaderActionTarget({
    required this.providerKey,
    required this.interestId,
    required this.title,
    required this.citationIds,
    this.bodyPreview,
    this.canonicalUrl,
  });

  final String providerKey;
  final String interestId;
  final String title;
  final String? bodyPreview;
  final String? canonicalUrl;
  final List<String> citationIds;

  bool get isValid {
    return providerKey.trim().isNotEmpty &&
        interestId.trim().isNotEmpty &&
        title.trim().isNotEmpty;
  }
}

final class ReaderActionResult {
  const ReaderActionResult({
    required this.actionId,
    required this.idempotencyKey,
    required this.kind,
    required this.created,
    required this.learningDirection,
  });

  final String actionId;
  final String idempotencyKey;
  final String kind;
  final bool created;
  final String learningDirection;
}

final class ReaderActionTargetResolver {
  const ReaderActionTargetResolver();

  ReaderActionTarget? resolve({
    required ReaderSummary summary,
    required ReaderAction action,
  }) {
    final readerItem = _bestReaderItemForAction(summary, action);
    if (readerItem == null) {
      return null;
    }

    final interestId = readerItem.matchedInterestIds.firstOrNull;
    if (interestId == null || interestId.trim().isEmpty) {
      return null;
    }

    final target = ReaderActionTarget(
      providerKey: readerItem.providerKey,
      interestId: interestId,
      title: readerItem.title,
      bodyPreview: readerItem.reason,
      canonicalUrl: action.canonicalUrl ?? readerItem.canonicalUrl,
      citationIds: readerItem.citationIds,
    );
    return target.isValid ? target : null;
  }

  TopRead? _bestReaderItemForAction(
    ReaderSummary summary,
    ReaderAction action,
  ) {
    final allItems = [
      ...summary.content.topReads,
      for (final section in summary.content.interestSections) ...section.items,
    ];
    final actionCitationIds = action.citationIds.toSet();

    for (final item in allItems) {
      if (actionCitationIds.isNotEmpty &&
          item.citationIds.any(actionCitationIds.contains)) {
        return item;
      }
    }

    final actionUrl = action.canonicalUrl?.trim();
    if (actionUrl != null && actionUrl.isNotEmpty) {
      for (final item in allItems) {
        if (item.canonicalUrl == actionUrl) {
          return item;
        }
      }
    }

    return allItems.firstOrNull;
  }
}
