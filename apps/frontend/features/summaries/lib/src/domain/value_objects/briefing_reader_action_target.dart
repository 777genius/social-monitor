import '../entities/generated_briefing.dart';

const supportedBriefingReaderFeedbackActionKinds = {
  'mark_relevant',
  'mark_not_relevant',
};

enum BriefingReaderFeedbackReason {
  notSameStory('not_same_story', 'Not same story'),
  duplicate('duplicate', 'Duplicate'),
  lowQualitySource('low_quality_source', 'Low quality source'),
  overratedProvider('overrated_provider', 'Overrated provider');

  const BriefingReaderFeedbackReason(this.apiValue, this.label);

  final String apiValue;
  final String label;
}

final class BriefingReaderActionTarget {
  const BriefingReaderActionTarget({
    required this.providerKey,
    required this.topicId,
    required this.title,
    required this.citationIds,
    this.bodyPreview,
    this.canonicalUrl,
  });

  final String providerKey;
  final String topicId;
  final String title;
  final String? bodyPreview;
  final String? canonicalUrl;
  final List<String> citationIds;

  bool get isValid {
    return providerKey.trim().isNotEmpty &&
        topicId.trim().isNotEmpty &&
        title.trim().isNotEmpty;
  }
}

final class BriefingReaderActionResult {
  const BriefingReaderActionResult({
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

final class BriefingReaderActionTargetResolver {
  const BriefingReaderActionTargetResolver();

  BriefingReaderActionTarget? resolve({
    required GeneratedBriefing briefing,
    required BriefingNextAction action,
  }) {
    final readerItem = _bestReaderItemForAction(briefing, action);
    if (readerItem == null) {
      return null;
    }

    final topicId = readerItem.matchedTopicIds.firstOrNull;
    if (topicId == null || topicId.trim().isEmpty) {
      return null;
    }

    final target = BriefingReaderActionTarget(
      providerKey: readerItem.providerKey,
      topicId: topicId,
      title: readerItem.title,
      bodyPreview: readerItem.reason,
      canonicalUrl: action.canonicalUrl ?? readerItem.canonicalUrl,
      citationIds: readerItem.citationIds,
    );
    return target.isValid ? target : null;
  }

  BriefingReaderItem? _bestReaderItemForAction(
    GeneratedBriefing briefing,
    BriefingNextAction action,
  ) {
    final allItems = [
      ...briefing.readerBrief.topReads,
      for (final section in briefing.readerBrief.topicSections)
        ...section.items,
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
