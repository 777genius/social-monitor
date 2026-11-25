import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class LoadTopicRecommendationsQuery {
  const LoadTopicRecommendationsQuery({
    required this.scope,
    this.windowDays = 14,
    this.limit = 6,
  });

  final WorkspaceScope scope;
  final int windowDays;
  final int limit;

  LoadTopicRecommendationsQuery normalized() {
    return LoadTopicRecommendationsQuery(
      scope: scope,
      windowDays: windowDays.clamp(3, 30),
      limit: limit.clamp(1, 20),
    );
  }
}
