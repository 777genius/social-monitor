import 'package:flutter/widgets.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/source_profile.dart';
import '../formatters/source_profile_display_formatters.dart';

class SourceProfileBadges extends StatelessWidget {
  const SourceProfileBadges({super.key, required this.profile});

  final SourceProfile profile;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.xs,
      runSpacing: AppSpacing.xs,
      children: [
        AppStatusBadge(
          label: profile.productionSafe ? 'Production' : 'Not production safe',
          tone: profile.productionSafe
              ? AppStatusTone.success
              : AppStatusTone.warning,
        ),
        AppStatusBadge(
          label: sourceReadinessLabel(profile.readinessState),
          tone: sourceProfileTone(profile),
        ),
        if (profile.isDegraded)
          AppStatusBadge(
            label: sourceProfileAvailabilityLabel(profile),
            tone: sourceProfileTone(profile),
          ),
      ],
    );
  }
}
