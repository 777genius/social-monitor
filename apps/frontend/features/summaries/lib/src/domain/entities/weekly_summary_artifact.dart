import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../value_objects/weekly_summary_week.dart';
import 'weekly_summary_citation.dart';
import 'weekly_summary_section.dart';
import 'weekly_summary_story.dart';

final class WeeklySummaryArtifact {
  const WeeklySummaryArtifact._({
    required this.provenance,
    required this.headline,
    required this.headlineCitationIds,
    required this.takeaway,
    required this.takeawayCitationIds,
    required this.synthesis,
    required this.synthesisCitationIds,
    required this.stories,
    required this.sections,
    required this.citations,
  });

  static Result<WeeklySummaryArtifact> create({
    required WeeklySummaryWeek week,
    required WeeklySummaryArtifactProvenance provenance,
    required String headline,
    required List<String> headlineCitationIds,
    required String takeaway,
    required List<String> takeawayCitationIds,
    required String synthesis,
    required List<String> synthesisCitationIds,
    required List<WeeklySummaryStory> stories,
    required List<WeeklySummarySection> sections,
    required List<WeeklySummaryCitation> citations,
  }) {
    if (!_allNonBlank([headline, takeaway, synthesis]) ||
        citations.isEmpty ||
        stories.isEmpty ||
        stories.length > 12 ||
        sections.isEmpty ||
        sections.length > 6) {
      return _invalid();
    }

    final citationIds = citations.map((citation) => citation.citationId).toSet();
    final storyIds = stories.map((story) => story.storyId).toSet();
    final sectionIds = sections.map((section) => section.sectionId).toSet();
    if (citationIds.length != citations.length ||
        storyIds.length != stories.length ||
        sectionIds.length != sections.length ||
        sections
                .map((section) => '${section.storyId}:${section.kind.name}')
                .toSet()
                .length !=
            sections.length ||
        citations.any(
          (citation) => !week.containsIsoDate(citation.requestedUtcDate),
        ) ||
        stories.any(
          (story) =>
              !_validObservedRange(story.observedFrom, story.observedThrough, week),
        ) ||
        sections.any(
          (section) =>
              !storyIds.contains(section.storyId) ||
              !_validObservedRange(
                section.observedFrom,
                section.observedThrough,
                week,
              ),
        )) {
      return _invalid();
    }

    final referenceGroups = <List<String>>[
      headlineCitationIds,
      takeawayCitationIds,
      synthesisCitationIds,
      ...stories.map((story) => story.citationIds),
      ...sections.map((section) => section.citationIds),
    ];
    if (referenceGroups.any(
      (citationReferences) =>
          !_validCitationReferences(citationReferences, citationIds),
    )) {
      return _invalid();
    }

    final referencedCitationIds = <String>{
      for (final citationReferences in referenceGroups) ...citationReferences,
    };
    if (referencedCitationIds.length != citationIds.length) {
      return _invalid();
    }

    return Result.success(
      WeeklySummaryArtifact._(
        provenance: provenance,
        headline: headline,
        headlineCitationIds: List<String>.unmodifiable(headlineCitationIds),
        takeaway: takeaway,
        takeawayCitationIds: List<String>.unmodifiable(takeawayCitationIds),
        synthesis: synthesis,
        synthesisCitationIds: List<String>.unmodifiable(synthesisCitationIds),
        stories: List<WeeklySummaryStory>.unmodifiable(stories),
        sections: List<WeeklySummarySection>.unmodifiable(sections),
        citations: List<WeeklySummaryCitation>.unmodifiable(citations),
      ),
    );
  }

  final WeeklySummaryArtifactProvenance provenance;
  final String headline;
  final List<String> headlineCitationIds;
  final String takeaway;
  final List<String> takeawayCitationIds;
  final String synthesis;
  final List<String> synthesisCitationIds;
  final List<WeeklySummaryStory> stories;
  final List<WeeklySummarySection> sections;
  final List<WeeklySummaryCitation> citations;

  static bool _allNonBlank(Iterable<String> values) =>
      values.every((value) => value.trim().isNotEmpty);

  static bool _validObservedRange(
    String from,
    String through,
    WeeklySummaryWeek week,
  ) =>
      week.containsIsoDate(from) &&
      week.containsIsoDate(through) &&
      from.compareTo(through) <= 0;

  static bool _validCitationReferences(
    List<String> citationReferences,
    Set<String> knownCitationIds,
  ) =>
      citationReferences.isNotEmpty &&
      citationReferences.length <= 24 &&
      citationReferences.length == citationReferences.toSet().length &&
      citationReferences.every(
        (citationId) =>
            citationId.trim().isNotEmpty && knownCitationIds.contains(citationId),
      );

  static Result<WeeklySummaryArtifact> _invalid() => const Result.failure(
    ValidationFailure(
      message: 'Weekly summary artifact could not be verified.',
      code: 'summaries.weekly_artifact_invalid',
    ),
  );
}

final class WeeklySummaryArtifactProvenance {
  const WeeklySummaryArtifactProvenance._({
    required this.artifactId,
    required this.artifactSha256,
    required this.schemaVersion,
    required this.sealId,
    required this.sealSha256,
    required this.publicationProofId,
    required this.publicationProofSha256,
    required this.modelInputSealId,
    required this.modelInputSealSha256,
    required this.editorialQualitySha256,
  });

  static const supportedSchemaVersion = 'reader_summary.weekly_model_output.v1';

  static Result<WeeklySummaryArtifactProvenance> create({
    required String artifactId,
    required String artifactSha256,
    required String schemaVersion,
    required String sealId,
    required String sealSha256,
    required String publicationProofId,
    required String publicationProofSha256,
    required String modelInputSealId,
    required String modelInputSealSha256,
    required String editorialQualitySha256,
  }) {
    if (schemaVersion != supportedSchemaVersion ||
        !_allNonBlank([
          artifactId,
          artifactSha256,
          sealId,
          sealSha256,
          publicationProofId,
          publicationProofSha256,
          modelInputSealId,
          modelInputSealSha256,
          editorialQualitySha256,
        ])) {
      return _invalid();
    }
    return Result.success(
      WeeklySummaryArtifactProvenance._(
        artifactId: artifactId,
        artifactSha256: artifactSha256,
        schemaVersion: schemaVersion,
        sealId: sealId,
        sealSha256: sealSha256,
        publicationProofId: publicationProofId,
        publicationProofSha256: publicationProofSha256,
        modelInputSealId: modelInputSealId,
        modelInputSealSha256: modelInputSealSha256,
        editorialQualitySha256: editorialQualitySha256,
      ),
    );
  }

  final String artifactId;
  final String artifactSha256;
  final String schemaVersion;
  final String sealId;
  final String sealSha256;
  final String publicationProofId;
  final String publicationProofSha256;
  final String modelInputSealId;
  final String modelInputSealSha256;
  final String editorialQualitySha256;

  static bool _allNonBlank(Iterable<String> values) =>
      values.every((value) => value.trim().isNotEmpty);

  static Result<WeeklySummaryArtifactProvenance> _invalid() =>
      const Result.failure(
        ValidationFailure(
          message: 'Weekly summary provenance could not be verified.',
          code: 'summaries.weekly_artifact_invalid',
        ),
      );
}
