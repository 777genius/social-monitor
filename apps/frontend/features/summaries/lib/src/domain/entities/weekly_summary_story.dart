import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

enum WeeklySummaryStoryStatus { newStory, developing, resolved, watch }

final class WeeklySummaryStory {
  const WeeklySummaryStory._({
    required this.storyId,
    required this.headline,
    required this.summary,
    required this.status,
    required this.observedFrom,
    required this.observedThrough,
    required this.citationIds,
  });

  static Result<WeeklySummaryStory> create({
    required String storyId,
    required String headline,
    required String summary,
    required WeeklySummaryStoryStatus status,
    required String observedFrom,
    required String observedThrough,
    required List<String> citationIds,
  }) {
    if (!_allNonBlank([
          storyId,
          headline,
          summary,
          observedFrom,
          observedThrough,
        ]) ||
        citationIds.isEmpty ||
        citationIds.any((citationId) => citationId.trim().isEmpty)) {
      return _invalid();
    }
    return Result.success(
      WeeklySummaryStory._(
        storyId: storyId,
        headline: headline,
        summary: summary,
        status: status,
        observedFrom: observedFrom,
        observedThrough: observedThrough,
        citationIds: List<String>.unmodifiable(citationIds),
      ),
    );
  }

  final String storyId;
  final String headline;
  final String summary;
  final WeeklySummaryStoryStatus status;
  final String observedFrom;
  final String observedThrough;
  final List<String> citationIds;

  static bool _allNonBlank(Iterable<String> values) =>
      values.every((value) => value.trim().isNotEmpty);

  static Result<WeeklySummaryStory> _invalid() => const Result.failure(
    ValidationFailure(
      message: 'Weekly summary story could not be verified.',
      code: 'summaries.weekly_story_invalid',
    ),
  );
}
