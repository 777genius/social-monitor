import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/interest_coverage_plan.dart';
import '../formatters/source_binding_display_formatters.dart';
import '../stores/interest_coverage_plan_store.dart';

class InterestCoverageSourcePackSelector extends StatelessWidget {
  const InterestCoverageSourcePackSelector({
    super.key,
    required this.store,
    required this.isLoading,
  });

  final InterestCoveragePlanStore store;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    final selected = store.sourcePackKey ?? _customSourcePackKey;
    final colorScheme = Theme.of(context).colorScheme;

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: DecoratedBox(
        decoration: BoxDecoration(
          border: Border.all(color: colorScheme.outlineVariant),
          borderRadius: BorderRadius.circular(8),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(7),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (
                var index = 0;
                index < _sourcePackOptions.length;
                index++
              ) ...[
                _SourcePackSegmentButton(
                  option: _sourcePackOptions[index],
                  selected: selected == _sourcePackOptions[index].key,
                  enabled: !isLoading,
                  onSelected: () {
                    final key = _sourcePackOptions[index].key;
                    unawaited(
                      store.selectSourcePack(
                        key == _customSourcePackKey ? null : key,
                      ),
                    );
                  },
                ),
                if (index < _sourcePackOptions.length - 1)
                  SizedBox(
                    height: 40,
                    child: ColoredBox(
                      color: colorScheme.outlineVariant,
                      child: const SizedBox(width: 1),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _SourcePackSegmentButton extends StatelessWidget {
  const _SourcePackSegmentButton({
    required this.option,
    required this.selected,
    required this.enabled,
    required this.onSelected,
  });

  final _SourcePackOption option;
  final bool selected;
  final bool enabled;
  final VoidCallback onSelected;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final foregroundColor = selected
        ? colorScheme.onPrimaryContainer
        : colorScheme.onSurfaceVariant;
    final effectiveForegroundColor = enabled
        ? foregroundColor
        : colorScheme.onSurfaceVariant.withValues(alpha: 0.45);
    final controlKeyBase = 'source-pack-option-${option.key}';
    return Semantics(
      button: true,
      enabled: enabled,
      selected: selected,
      label: option.label,
      child: MouseRegion(
        cursor: enabled ? SystemMouseCursors.click : SystemMouseCursors.basic,
        child: GestureDetector(
          key: ValueKey(controlKeyBase),
          behavior: HitTestBehavior.opaque,
          onTap: enabled ? onSelected : null,
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: selected ? colorScheme.primaryContainer : null,
            ),
            child: SizedBox(
              width: 128,
              height: 48,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm,
                  ),
                  child: IconTheme(
                    data: IconThemeData(
                      color: effectiveForegroundColor,
                      size: 18,
                    ),
                    child: DefaultTextStyle.merge(
                      style: TextStyle(
                        color: effectiveForegroundColor,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0,
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(option.icon),
                          const SizedBox(width: AppSpacing.xs),
                          Flexible(
                            child: Text(
                              option.label,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class InterestCoverageSourcePackSummary extends StatelessWidget {
  const InterestCoverageSourcePackSummary({
    super.key,
    required this.sourcePack,
  });

  final InterestCoverageSourcePack sourcePack;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          sourcePack.displayName,
          style: Theme.of(context).textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          children: sourcePack.providerStarters
              .map(
                (starter) => AppStatusBadge(
                  label:
                      '${sourceProviderLabel(starter.providerKey)}: ${_starterPreview(starter)}',
                ),
              )
              .toList(growable: false),
        ),
      ],
    );
  }

  String _starterPreview(InterestCoverageSourcePackProviderStarter starter) {
    final values = [
      ...starter.subreddits.map((value) => 'r/$value'),
      ...starter.queries,
      ...starter.topics.map((value) => '#$value'),
      ...starter.rssFeedUrls,
      ...starter.keywords,
    ];
    if (values.isEmpty) {
      return 'starter queries';
    }
    return values.take(2).map(_shortPreviewValue).join(', ');
  }

  String _shortPreviewValue(String value) {
    if (value.length <= 26) {
      return value;
    }
    return '${value.substring(0, 23)}...';
  }
}

const _customSourcePackKey = 'custom';

const _sourcePackOptions = [
  _SourcePackOption(
    key: _customSourcePackKey,
    label: 'Custom',
    icon: Icons.tune,
  ),
  _SourcePackOption(key: 'ai_dev', label: 'AI dev', icon: Icons.memory),
  _SourcePackOption(
    key: 'startup_radar',
    label: 'Startup',
    icon: Icons.rocket_launch_outlined,
  ),
  _SourcePackOption(key: 'security', label: 'Security', icon: Icons.security),
  _SourcePackOption(
    key: 'crypto',
    label: 'Crypto',
    icon: Icons.currency_exchange,
  ),
];

final class _SourcePackOption {
  const _SourcePackOption({
    required this.key,
    required this.label,
    required this.icon,
  });

  final String key;
  final String label;
  final IconData icon;
}
