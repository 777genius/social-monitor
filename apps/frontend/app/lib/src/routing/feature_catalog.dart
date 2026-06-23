import 'package:flutter/widgets.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

abstract interface class AppFeatureDescriptor {
  String get id;

  String get title;

  String get description;

  FeatureRouteContract get route;

  IconData get icon;

  String get status;

  Widget buildPage(BuildContext context);
}
