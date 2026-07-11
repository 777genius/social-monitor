import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:url_launcher/url_launcher.dart';

const guestCommunityDestinations = [
  AppShellDestination(
    label: 'GitHub',
    path: 'https://github.com/777genius/social-monitor',
    icon: Icons.code_rounded,
  ),
  AppShellDestination(
    label: 'Discord',
    path: 'https://discord.gg/MWmrv57Qkt',
    icon: Icons.forum_outlined,
  ),
];

ValueChanged<String> appDestinationHandler(BuildContext context) {
  return (path) {
    if (guestCommunityDestinations.any(
      (destination) => destination.path == path,
    )) {
      unawaited(
        launchUrl(
          Uri.parse(path),
          mode: LaunchMode.externalApplication,
          webOnlyWindowName: '_blank',
        ),
      );
      return;
    }
    context.go(path);
  };
}
