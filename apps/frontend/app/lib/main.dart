import 'package:flutter/widgets.dart';
import 'package:flutter_web_plugins/url_strategy.dart';

import 'src/app/social_monitor_app.dart';
import 'src/composition/app_composition_root.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  usePathUrlStrategy();

  final composition = AppCompositionRoot.production();

  runApp(SocialMonitorApp(composition: composition));
}
