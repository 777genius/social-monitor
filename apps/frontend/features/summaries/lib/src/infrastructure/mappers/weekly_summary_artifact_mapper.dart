import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/weekly_summary_artifact.dart';
import '../../domain/entities/weekly_summary_citation.dart';
import '../../domain/entities/weekly_summary_section.dart';
import '../../domain/entities/weekly_summary_story.dart';
import '../../domain/value_objects/weekly_summary_week.dart';

final class WeeklySummaryArtifactMapper {
  const WeeklySummaryArtifactMapper();

  Result<WeeklySummaryArtifact> toDomain(
    generated.ReaderSummaryWeeklyProjectionArtifactDto dto,
    WeeklySummaryWeek week,
  ) {
    if (dto.schemaVersion !=
        WeeklySummaryArtifactProvenance.supportedSchemaVersion) {
      return _invalid('summaries.weekly_artifact_schema_unsupported');
    }

    final provenance = _valueOrNull(
      WeeklySummaryArtifactProvenance.create(
        artifactId: dto.artifactId,
        artifactSha256: dto.artifactSha256,
        schemaVersion: dto.schemaVersion,
        sealId: dto.sealId,
        sealSha256: dto.sealSha256,
        publicationProofId: dto.publicationProofId,
        publicationProofSha256: dto.publicationProofSha256,
        modelInputSealId: dto.modelInputSealId,
        modelInputSealSha256: dto.modelInputSealSha256,
        editorialQualitySha256: dto.editorialQualitySha256,
      ),
    );
    if (provenance == null) {
      return _invalid('summaries.weekly_artifact_invalid');
    }

    final citations = <WeeklySummaryCitation>[];
    for (final citation in dto.citations) {
      final mapped = _citationFrom(citation);
      if (mapped == null) {
        return _invalid('summaries.weekly_citation_invalid');
      }
      citations.add(mapped);
    }

    final stories = <WeeklySummaryStory>[];
    for (final story in dto.stories) {
      final mapped = _storyFrom(story);
      if (mapped == null) {
        return _invalid('summaries.weekly_story_invalid');
      }
      stories.add(mapped);
    }

    final sections = <WeeklySummarySection>[];
    for (final section in dto.sections) {
      final mapped = _sectionFrom(section);
      if (mapped == null) {
        return _invalid('summaries.weekly_section_invalid');
      }
      sections.add(mapped);
    }

    return WeeklySummaryArtifact.create(
      week: week,
      provenance: provenance,
      headline: dto.headline,
      headlineCitationIds: dto.headlineCitationIds,
      takeaway: dto.takeaway,
      takeawayCitationIds: dto.takeawayCitationIds,
      synthesis: dto.synthesis,
      synthesisCitationIds: dto.synthesisCitationIds,
      stories: stories,
      sections: sections,
      citations: citations,
    );
  }

  WeeklySummaryCitation? _citationFrom(
    generated.ReaderSummaryWeeklyProjectionCitationDto dto,
  ) =>
      _valueOrNull(
        WeeklySummaryCitation.create(
          citationId: dto.citationId,
          requestedUtcDate: dto.requestedUtcDate,
          publicationId: dto.publicationId,
          providerKey: dto.providerKey,
          feedItemId: dto.feedItemId,
          sourceItemId: dto.sourceItemId,
          sourceBindingId: dto.sourceBindingId,
          providerItemId: dto.providerItemId,
          canonicalUrl: dto.canonicalUrl,
          sourceContentHash: dto.sourceContentHash,
        ),
      );

  WeeklySummaryStory? _storyFrom(
    generated.ReaderSummaryWeeklyProjectionStoryDto dto,
  ) {
    final status = switch (dto.status.toJson()) {
      'new' => WeeklySummaryStoryStatus.newStory,
      'developing' => WeeklySummaryStoryStatus.developing,
      'resolved' => WeeklySummaryStoryStatus.resolved,
      'watch' => WeeklySummaryStoryStatus.watch,
      _ => null,
    };
    if (status == null) {
      return null;
    }
    return _valueOrNull(
      WeeklySummaryStory.create(
        storyId: dto.storyId,
        headline: dto.headline,
        summary: dto.summary,
        status: status,
        observedFrom: dto.observedFrom,
        observedThrough: dto.observedThrough,
        citationIds: dto.citationIds,
      ),
    );
  }

  WeeklySummarySection? _sectionFrom(
    generated.ReaderSummaryWeeklyProjectionSectionDto dto,
  ) {
    final kind = switch (dto.kind.toJson()) {
      'lead' => WeeklySummarySectionKind.lead,
      'development' => WeeklySummarySectionKind.development,
      'why_it_matters' => WeeklySummarySectionKind.whyItMatters,
      'watch' => WeeklySummarySectionKind.watch,
      _ => null,
    };
    final claimType = switch (dto.claimType.toJson()) {
      'snapshot' => WeeklySummaryClaimType.snapshot,
      'evolution' => WeeklySummaryClaimType.evolution,
      'resolution' => WeeklySummaryClaimType.resolution,
      _ => null,
    };
    if (kind == null || claimType == null) {
      return null;
    }
    return _valueOrNull(
      WeeklySummarySection.create(
        sectionId: dto.sectionId,
        storyId: dto.storyId,
        kind: kind,
        claimType: claimType,
        heading: dto.heading,
        text: dto.text,
        observedFrom: dto.observedFrom,
        observedThrough: dto.observedThrough,
        citationIds: dto.citationIds,
      ),
    );
  }

  T? _valueOrNull<T extends Object>(Result<T> result) => result.fold(
    onSuccess: (value) => value,
    onFailure: (_) => null,
  );

  Result<WeeklySummaryArtifact> _invalid(String code) => Result.failure(
    ValidationFailure(
      message: 'Weekly summary artifact provenance could not be verified.',
      code: code,
    ),
  );
}
