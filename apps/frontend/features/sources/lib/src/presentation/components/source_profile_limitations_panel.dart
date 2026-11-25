import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/source_profile.dart';

class SourceProfileLimitationsPanel extends StatelessWidget {
  const SourceProfileLimitationsPanel({super.key, required this.profile});

  final SourceProfile profile;

  @override
  Widget build(BuildContext context) {
    final limitations = profile.allLimitations;
    final textTheme = Theme.of(context).textTheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Limitations',
              style: textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: 0,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            if (limitations.isEmpty)
              Text(
                'No documented limitations.',
                style: textTheme.bodyMedium?.copyWith(letterSpacing: 0),
              )
            else
              for (final item in limitations)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('- '),
                      Expanded(
                        child: Text(
                          item,
                          style: textTheme.bodyMedium?.copyWith(
                            letterSpacing: 0,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
          ],
        ),
      ),
    );
  }
}
