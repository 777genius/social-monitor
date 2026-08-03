import 'package:flutter/widgets.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

abstract interface class AppRouteDescriptor {
  FeatureRouteContract get route;

  Widget buildPage(BuildContext context, Uri uri);
}

abstract interface class AppFeatureDescriptor extends AppRouteDescriptor {
  String get id;

  String get title;

  String get description;

  IconData get icon;

  String get status;
}
