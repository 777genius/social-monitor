import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/source_profile.dart';
import '../../domain/value_objects/source_provider_key.dart';
import '../formatters/source_profile_display_formatters.dart';
import 'source_profile_badges.dart';
import 'source_profile_card.dart';
import 'source_profile_limitations_panel.dart';

class SourceProfilesLayout extends StatelessWidget {
  const SourceProfilesLayout({
    super.key,
    required this.profiles,
    required this.isExpanded,
    required this.onToggleLimitations,
  });

  final List<SourceProfile> profiles;
  final bool Function(SourceProviderKey providerKey) isExpanded;
  final void Function(SourceProviderKey providerKey) onToggleLimitations;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= 960) {
          return _SourceProfilesTable(
            profiles: profiles,
            isExpanded: isExpanded,
            onToggleLimitations: onToggleLimitations,
          );
        }
        return Column(
          children: profiles
              .map((profile) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.md),
                  child: SourceProfileCard(
                    profile: profile,
                    isExpanded: isExpanded(profile.providerKey),
                    onToggleLimitations: () =>
                        onToggleLimitations(profile.providerKey),
                  ),
                );
              })
              .toList(growable: false),
        );
      },
    );
  }
}

class _SourceProfilesTable extends StatelessWidget {
  const _SourceProfilesTable({
    required this.profiles,
    required this.isExpanded,
    required this.onToggleLimitations,
  });

  final List<SourceProfile> profiles;
  final bool Function(SourceProviderKey providerKey) isExpanded;
  final void Function(SourceProviderKey providerKey) onToggleLimitations;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.surface,
        border: Border.all(color: colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        children: [
          const _SourceProfilesHeaderRow(),
          for (final profile in profiles) ...[
            Divider(height: 1, color: colorScheme.outlineVariant),
            _SourceProfilesDataRow(
              profile: profile,
              isExpanded: isExpanded(profile.providerKey),
              onToggleLimitations: () =>
                  onToggleLimitations(profile.providerKey),
            ),
            if (isExpanded(profile.providerKey))
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.md,
                  0,
                  AppSpacing.md,
                  AppSpacing.md,
                ),
                child: SourceProfileLimitationsPanel(profile: profile),
              ),
          ],
        ],
      ),
    );
  }
}

class _SourceProfilesHeaderRow extends StatelessWidget {
  const _SourceProfilesHeaderRow();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.all(AppSpacing.md),
      child: Row(
        children: [
          Expanded(flex: 2, child: _HeaderCell('Provider')),
          Expanded(child: _HeaderCell('Safety')),
          Expanded(child: _HeaderCell('Runtime')),
          Expanded(child: _HeaderCell('Mode')),
          Expanded(flex: 2, child: _HeaderCell('Query modes')),
          Expanded(child: _HeaderCell('Content')),
          SizedBox(width: 48),
        ],
      ),
    );
  }
}

class _SourceProfilesDataRow extends StatelessWidget {
  const _SourceProfilesDataRow({
    required this.profile,
    required this.isExpanded,
    required this.onToggleLimitations,
  });

  final SourceProfile profile;
  final bool isExpanded;
  final VoidCallback onToggleLimitations;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: Row(
              children: [
                Icon(sourceProviderIcon(profile), size: 28),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        profile.displayName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0,
                        ),
                      ),
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
              ],
            ),
          ),
          Expanded(child: SourceProfileBadges(profile: profile)),
          Expanded(
            child: _BodyCell(
              sourceRuntimeReadinessLabel(profile.runtimeReadiness),
            ),
          ),
          Expanded(child: _BodyCell(profile.acquisitionMode)),
          Expanded(
            flex: 2,
            child: _BodyCell(joinedOrDash(profile.supportedQueryModes)),
          ),
          Expanded(
            child: _BodyCell(joinedOrDash(profile.supportedContentUnits)),
          ),
          SizedBox(
            width: 48,
            child: IconButton(
              tooltip: isExpanded ? 'Hide limitations' : 'Show limitations',
              onPressed: onToggleLimitations,
              icon: Icon(
                isExpanded
                    ? Icons.keyboard_arrow_up
                    : Icons.keyboard_arrow_down,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HeaderCell extends StatelessWidget {
  const _HeaderCell(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: Theme.of(context).textTheme.labelMedium?.copyWith(
        fontWeight: FontWeight.w800,
        letterSpacing: 0,
      ),
    );
  }
}

class _BodyCell extends StatelessWidget {
  const _BodyCell(this.value);

  final String value;

  @override
  Widget build(BuildContext context) {
    return Text(
      value,
      maxLines: 3,
      overflow: TextOverflow.ellipsis,
      style: Theme.of(context).textTheme.bodyMedium?.copyWith(letterSpacing: 0),
    );
  }
}
