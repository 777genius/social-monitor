import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import 'reader_summary_provider_label.dart';

class ReaderSummaryProviderLogo extends StatelessWidget {
  const ReaderSummaryProviderLogo({
    super.key,
    required this.providerKey,
    this.size = 18,
  });

  final String providerKey;
  final double size;

  @override
  Widget build(BuildContext context) {
    return AppProviderLogo(providerKey: providerKey, size: size);
  }
}

class ReaderSummaryProviderLogoChip extends StatelessWidget {
  const ReaderSummaryProviderLogoChip({
    super.key,
    required this.providerKey,
    this.count,
  });

  final String providerKey;
  final int? count;

  @override
  Widget build(BuildContext context) {
    final label = readerSummaryProviderLabel(providerKey);
    final colorScheme = Theme.of(context).colorScheme;
    return Semantics(
      label: count == null ? label : '$label $count',
      child: Tooltip(
        message: label,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: colorScheme.surfaceContainerLow,
            border: Border.all(color: colorScheme.outlineVariant),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: count == null ? 8 : 10,
              vertical: 6,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                ReaderSummaryProviderLogo(providerKey: providerKey),
                if (count != null) ...[
                  const SizedBox(width: AppSpacing.xs),
                  Text(
                    count.toString(),
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
