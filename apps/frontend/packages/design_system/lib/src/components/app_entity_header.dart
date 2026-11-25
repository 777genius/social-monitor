import 'package:flutter/material.dart';

import '../tokens/app_spacing.dart';
import 'app_status_badge.dart';

class AppEntityHeader extends StatelessWidget {
  const AppEntityHeader({
    super.key,
    required this.title,
    required this.subtitle,
    required this.status,
    this.metadata = const [],
    this.actions,
  });

  final String title;
  final String subtitle;
  final AppStatusBadge status;
  final List<AppEntityMetadata> metadata;
  final Widget? actions;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: AppSpacing.md,
          runSpacing: AppSpacing.sm,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            Text(
              title,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: 0,
              ),
            ),
            status,
          ],
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(subtitle, style: Theme.of(context).textTheme.bodyMedium),
        if (metadata.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.md,
            runSpacing: AppSpacing.sm,
            children: [
              for (final item in metadata)
                Text(
                  '${item.label}: ${item.value}',
                  style: Theme.of(context).textTheme.labelMedium,
                ),
            ],
          ),
        ],
        if (actions != null) ...[
          const SizedBox(height: AppSpacing.md),
          actions!,
        ],
      ],
    );
  }
}

final class AppEntityMetadata {
  const AppEntityMetadata({required this.label, required this.value});

  final String label;
  final String value;
}
