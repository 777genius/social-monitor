import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';

import '../pages/source_bindings_page.dart';
import '../pages/source_profiles_page.dart';
import '../pages/sources_feature_page.dart';
import '../stores/scan_policy_store.dart';
import '../stores/scan_run_store.dart';
import '../stores/source_bindings_store.dart';
import '../stores/source_profiles_store.dart';
import '../stores/sources_catalog_store.dart';
import 'sources_feature_module.dart';

class SourcesFeatureModuleHost extends StatefulWidget {
  const SourcesFeatureModuleHost({super.key});

  @override
  State<SourcesFeatureModuleHost> createState() =>
      _SourcesFeatureModuleHostState();
}

class _SourcesFeatureModuleHostState extends State<SourcesFeatureModuleHost> {
  SourcesCatalogStore? _catalogStore;
  SourceProfilesStore? _profilesStore;
  SourceBindingsStore? _bindingsStore;
  ScanPolicyStore? _scanPolicyStore;
  ScanRunStore? _scanRunStore;
  SourcesFeatureModule? _module;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_module != null) {
      return;
    }
    final module = ModuleProvider.moduleOf<SourcesFeatureModule>(
      context,
      listen: false,
    );
    final binder = ModuleProvider.of(context, listen: false);
    _module = module;
    if (module.showSourceBindings) {
      _bindingsStore = binder.get<SourceBindingsStore>();
      _scanPolicyStore = binder.get<ScanPolicyStore>();
      _scanRunStore = binder.get<ScanRunStore>();
      return;
    }
    if (module.showSourceProfiles) {
      _profilesStore = binder.get<SourceProfilesStore>();
      return;
    }
    _catalogStore = binder.get<SourcesCatalogStore>();
  }

  @override
  void dispose() {
    _catalogStore?.dispose();
    _profilesStore?.dispose();
    _bindingsStore?.dispose();
    _scanPolicyStore?.dispose();
    _scanRunStore?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final module = _module;
    if (module == null) {
      return const SizedBox.shrink();
    }
    if (module.showSourceProfiles) {
      final store = _profilesStore;
      if (store == null) {
        return const SizedBox.shrink();
      }
      return SourceProfilesPage(store: store);
    }
    if (module.showSourceBindings) {
      final store = _bindingsStore;
      final policyStore = _scanPolicyStore;
      final scanRunStore = _scanRunStore;
      if (store == null || policyStore == null || scanRunStore == null) {
        return const SizedBox.shrink();
      }
      return SourceBindingsPage(
        store: store,
        policyStore: policyStore,
        scanRunStore: scanRunStore,
      );
    }
    final store = _catalogStore;
    if (store == null) {
      return const SizedBox.shrink();
    }
    return SourcesFeaturePage(store: store);
  }
}
