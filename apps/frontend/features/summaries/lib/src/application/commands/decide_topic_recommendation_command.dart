import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

enum TopicRecommendationDecisionAction {
  accept,
  reject,
  undo;

  String get apiValue => switch (this) {
    TopicRecommendationDecisionAction.accept => 'accept',
    TopicRecommendationDecisionAction.reject => 'reject',
    TopicRecommendationDecisionAction.undo => 'undo',
  };
}

final class DecideTopicRecommendationCommand {
  const DecideTopicRecommendationCommand({
    required this.scope,
    required this.recommendationId,
    required this.topicLabel,
    required this.action,
    this.interestIds = const [],
    this.providerKeys = const [],
    this.note,
  });

  final WorkspaceScope scope;
  final String recommendationId;
  final String topicLabel;
  final TopicRecommendationDecisionAction action;
  final List<String> interestIds;
  final List<String> providerKeys;
  final String? note;

  bool get isValid =>
      scope.isValid &&
      recommendationId.trim().isNotEmpty &&
      topicLabel.trim().isNotEmpty &&
      (action == TopicRecommendationDecisionAction.reject ||
          action == TopicRecommendationDecisionAction.undo ||
          _compact(interestIds).isNotEmpty);

  DecideTopicRecommendationCommand normalized() {
    return DecideTopicRecommendationCommand(
      scope: scope,
      recommendationId: recommendationId.trim(),
      topicLabel: topicLabel.trim(),
      action: action,
      interestIds: _compact(interestIds),
      providerKeys: _compact(providerKeys),
      note: note?.trim(),
    );
  }
}

List<String> _compact(List<String> values) {
  return values
      .map((value) => value.trim())
      .where((value) => value.isNotEmpty)
      .toSet()
      .toList(growable: false);
}
