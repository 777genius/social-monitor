import 'package:flutter/material.dart';
import 'package:modularity_flutter/modularity_flutter.dart';

import '../pages/settings_feature_page.dart';
import '../stores/summary_preference_store.dart';
import '../stores/workspace_settings_store.dart';

class SettingsFeatureModuleHost extends StatefulWidget {
  const SettingsFeatureModuleHost({
    super.key,
    this.themeMode,
    this.onThemeModeChanged,
  });

  final ThemeMode? themeMode;
  final ValueChanged<ThemeMode>? onThemeModeChanged;

  @override
  State<SettingsFeatureModuleHost> createState() =>
      _SettingsFeatureModuleHostState();
}

class _SettingsFeatureModuleHostState extends State<SettingsFeatureModuleHost> {
  WorkspaceSettingsStore? _store;
  SummaryPreferenceStore? _summaryPreferenceStore;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_store != null) {
      return;
    }
    final binder = ModuleProvider.of(context, listen: false);
    _store = binder.get<WorkspaceSettingsStore>();
    _summaryPreferenceStore = binder.get<SummaryPreferenceStore>();
  }

  @override
  void dispose() {
    _summaryPreferenceStore?.dispose();
    _store?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = _store;
    final summaryPreferenceStore = _summaryPreferenceStore;
    if (store == null || summaryPreferenceStore == null) {
      return const SizedBox.shrink();
    }
    return SettingsFeaturePage(
      store: store,
      summaryPreferenceStore: summaryPreferenceStore,
      themeMode: widget.themeMode,
      onThemeModeChanged: widget.onThemeModeChanged,
    );
  }
}
