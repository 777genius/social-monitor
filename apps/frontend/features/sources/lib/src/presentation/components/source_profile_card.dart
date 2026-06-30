import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/source_profile.dart';
import '../formatters/source_profile_display_formatters.dart';
import 'source_profile_badges.dart';
import 'source_profile_fact_grid.dart';
import 'source_profile_limitations_panel.dart';

class SourceProfileCard extends StatelessWidget {
  const SourceProfileCard({
    super.key,
    required this.profile,
    required this.isExpanded,
    required this.onToggleLimitations,
  });

  final SourceProfile profile;
  final bool isExpanded;
  final VoidCallback onToggleLimitations;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.surface,
        border: Border.all(color: colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  sourceProviderIcon(profile),
                  color: colorScheme.primary,
                  size: 28,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        profile.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0,
                            ),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      SourceProfileBadges(profile: profile),
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        profile.health.message,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(
                          context,
                        ).textTheme.bodySmall?.copyWith(letterSpacing: 0),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  tooltip: isExpanded ? 'Hide limitations' : 'Show limitations',
                  onPressed: onToggleLimitations,
                  icon: Icon(
                    isExpanded
                        ? Icons.keyboard_arrow_up
                        : Icons.keyboard_arrow_down,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            SourceProfileFactGrid(facts: _facts(profile)),
            if (isExpanded) ...[
              const SizedBox(height: AppSpacing.md),
              SourceProfileLimitationsPanel(profile: profile),
            ],
          ],
        ),
      ),
    );
  }
}

List<SourceProfileFact> _facts(SourceProfile profile) {
  return [
    SourceProfileFact(
      label: 'Runtime readiness',
      value: sourceRuntimeReadinessLabel(profile.runtimeReadiness),
    ),
    SourceProfileFact(
      label: 'Acquisition mode',
      value: profile.acquisitionMode,
    ),
    SourceProfileFact(
      label: 'Query modes',
      value: joinedOrDash(profile.supportedQueryModes),
    ),
    SourceProfileFact(
      label: 'Content units',
      value: joinedOrDash(profile.supportedContentUnits),
    ),
    SourceProfileFact(
      label: 'Unsupported',
      value: joinedOrDash(profile.unsupportedContentUnits),
    ),
    SourceProfileFact(label: 'Cursor model', value: profile.cursorModel),
    SourceProfileFact(label: 'Quota model', value: profile.quotaModel),
  ];
}
