import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:url_launcher/url_launcher.dart';

class GuestGitHubSidebarCard extends StatelessWidget {
  const GuestGitHubSidebarCard({super.key});

  static final Uri _repositoryUri = Uri.parse(
    'https://github.com/777genius/social-monitor',
  );

  @override
  Widget build(BuildContext context) {
    return AppSidebarCardSurface(
      key: const ValueKey('guest-github-link'),
      onTap: () => unawaited(
        launchUrl(
          _repositoryUri,
          mode: LaunchMode.externalApplication,
          webOnlyWindowName: '_blank',
        ),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.code_rounded,
            size: 18,
            color: AppColors.sidebarTextMuted,
          ),
          const SizedBox(width: AppSpacing.sm + 2),
          Expanded(
            child: Text(
              'GitHub',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: AppColors.sidebarText,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const Icon(
            Icons.open_in_new_rounded,
            size: 16,
            color: AppColors.sidebarTextMuted,
          ),
        ],
      ),
    );
  }
}
