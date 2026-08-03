import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

enum WeeklySummarySectionKind { lead, development, whyItMatters, watch }

enum WeeklySummaryClaimType { snapshot, evolution, resolution }

final class WeeklySummarySection {
  const WeeklySummarySection._({
    required this.sectionId,
    required this.storyId,
    required this.kind,
    required this.claimType,
    required this.heading,
    required this.text,
    required this.observedFrom,
    required this.observedThrough,
    required this.citationIds,
  });

  static Result<WeeklySummarySection> create({
    required String sectionId,
    required String storyId,
    required WeeklySummarySectionKind kind,
    required WeeklySummaryClaimType claimType,
    required String heading,
    required String text,
    required String observedFrom,
    required String observedThrough,
    required List<String> citationIds,
  }) {
    if (!_allNonBlank([
          sectionId,
          storyId,
          heading,
          text,
          observedFrom,
          observedThrough,
        ]) ||
        citationIds.isEmpty ||
        citationIds.any((citationId) => citationId.trim().isEmpty)) {
      return _invalid();
    }
    return Result.success(
      WeeklySummarySection._(
        sectionId: sectionId,
        storyId: storyId,
        kind: kind,
        claimType: claimType,
        heading: heading,
        text: text,
        observedFrom: observedFrom,
        observedThrough: observedThrough,
        citationIds: List<String>.unmodifiable(citationIds),
      ),
    );
  }

  final String sectionId;
  final String storyId;
  final WeeklySummarySectionKind kind;
  final WeeklySummaryClaimType claimType;
  final String heading;
  final String text;
  final String observedFrom;
  final String observedThrough;
  final List<String> citationIds;

  static bool _allNonBlank(Iterable<String> values) =>
      values.every((value) => value.trim().isNotEmpty);

  static Result<WeeklySummarySection> _invalid() => const Result.failure(
    ValidationFailure(
      message: 'Weekly summary section could not be verified.',
      code: 'summaries.weekly_section_invalid',
    ),
  );
}
