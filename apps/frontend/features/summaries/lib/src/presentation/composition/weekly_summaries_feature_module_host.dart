import 'package:flutter/widgets.dart';

import '../pages/weekly_summaries_feature_page.dart';
import '../stores/weekly_summaries_store.dart';
import 'weekly_summaries_feature_module.dart';

class WeeklySummariesFeatureModuleHost extends StatefulWidget {
  const WeeklySummariesFeatureModuleHost({super.key, required this.module});

  final WeeklySummariesFeatureModule module;

  @override
  State<WeeklySummariesFeatureModuleHost> createState() =>
      _WeeklySummariesFeatureModuleHostState();
}

class _WeeklySummariesFeatureModuleHostState
    extends State<WeeklySummariesFeatureModuleHost> {
  late final WeeklySummariesStore _store;

  @override
  void initState() {
    super.initState();
    _store = widget.module.createStore();
  }

  @override
  void dispose() {
    _store.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => WeeklySummariesFeaturePage(store: _store);
}
