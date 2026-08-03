import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/weekly_summary_artifact.dart';
import '../../domain/entities/weekly_summary_citation.dart';

class WeeklySummaryProvenancePanel extends StatelessWidget {
  const WeeklySummaryProvenancePanel({
    super.key,
    required this.provenance,
    required this.citations,
  });

  final WeeklySummaryArtifactProvenance provenance;
  final List<WeeklySummaryCitation> citations;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const AppSectionHeader(
          title: 'Certified provenance',
          description:
              'Artifact, publication, model-input, and editorial seals are shown with the exact evidence citations used by this weekly projection.',
        ),
        const SizedBox(height: AppSpacing.md),
        SelectionArea(
          child: Semantics(
            container: true,
            label: 'Weekly artifact certification provenance',
            child: Wrap(
              spacing: AppSpacing.lg,
              runSpacing: AppSpacing.sm,
              children: [
                _ProvenanceValue('Artifact id', provenance.artifactId),
                _ProvenanceValue('Artifact SHA-256', provenance.artifactSha256),
                _ProvenanceValue('Artifact schema', provenance.schemaVersion),
                _ProvenanceValue('Certification seal id', provenance.sealId),
                _ProvenanceValue('Certification seal SHA-256', provenance.sealSha256),
                _ProvenanceValue(
                  'Publication proof id',
                  provenance.publicationProofId,
                ),
                _ProvenanceValue(
                  'Publication proof SHA-256',
                  provenance.publicationProofSha256,
                ),
                _ProvenanceValue(
                  'Model-input seal id',
                  provenance.modelInputSealId,
                ),
                _ProvenanceValue(
                  'Model-input seal SHA-256',
                  provenance.modelInputSealSha256,
                ),
                _ProvenanceValue(
                  'Editorial quality SHA-256',
                  provenance.editorialQualitySha256,
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        const AppSectionHeader(
          title: 'Evidence citations',
          description:
              'Each citation preserves the published source, collection binding, feed identity, and content hash used for certification.',
        ),
        const SizedBox(height: AppSpacing.md),
        AppDataList<WeeklySummaryCitation>(
          items: citations,
          stableId: (citation) => citation.citationId,
          emptyTitle: 'No certification citations',
          emptyMessage:
              'A complete weekly projection cannot be reviewed without its evidence ledger.',
          itemBuilder: (context, citation, index) => Semantics(
            container: true,
            label: 'Citation ${citation.citationId}',
            child: ListTile(
              title: Text('${citation.citationId} · ${citation.providerKey}'),
              subtitle: Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: SelectionArea(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Requested UTC date: ${citation.requestedUtcDate}'),
                      Text('Publication id: ${citation.publicationId}'),
                      Text('Feed item id: ${citation.feedItemId}'),
                      Text('Source item id: ${citation.sourceItemId}'),
                      Text('Source binding id: ${citation.sourceBindingId}'),
                      Text('Provider item id: ${citation.providerItemId}'),
                      Text(
                        'Canonical URL: ${citation.safeDisplayLocation}',
                      ),
                      Text('Source content hash: ${citation.sourceContentHash}'),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _ProvenanceValue extends StatelessWidget {
  const _ProvenanceValue(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 340),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: Theme.of(context).textTheme.labelMedium),
          const SizedBox(height: AppSpacing.xs),
          Text(value, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}
