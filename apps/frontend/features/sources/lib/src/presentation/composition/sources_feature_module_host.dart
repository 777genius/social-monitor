import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';

import '../pages/source_bindings_page.dart';
import '../pages/source_profiles_page.dart';
import '../stores/interest_coverage_plan_store.dart';
import '../stores/scan_policy_store.dart';
import '../stores/scan_run_store.dart';
import '../stores/source_bindings_store.dart';
import '../stores/source_profiles_store.dart';
import 'sources_feature_module.dart';

class SourcesFeatureModuleHost extends StatefulWidget {
  const SourcesFeatureModuleHost({super.key});

  @override
  State<SourcesFeatureModuleHost> createState() =>
      _SourcesFeatureModuleHostState();
}

class _SourcesFeatureModuleHostState extends State<SourcesFeatureModuleHost> {
  SourceProfilesStore? _profilesStore;
  SourceBindingsStore? _bindingsStore;
  InterestCoveragePlanStore? _interestCoveragePlanStore;
  ScanPolicyStore? _scanPolicyStore;
  ScanRunStore? _scanRunStore;
  SourcesFeatureModule? _module;
  Timer? _resolveTimer;

  @override
  void initState() {
    super.initState();
    _resolveTimer = Timer.periodic(const Duration(milliseconds: 50), (_) {
      if (!mounted) {
        return;
      }
      if (_module != null) {
        _resolveTimer?.cancel();
        _resolveTimer = null;
        return;
      }
      setState(() {});
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _resolveModuleBindings();
  }

  bool _resolveModuleBindings() {
    if (_module != null) {
      _resolveTimer?.cancel();
      _resolveTimer = null;
      return true;
    }

    final provider = context.getInheritedWidgetOfExactType<ModuleProvider>();
    final module = provider?.controller.module;
    if (provider == null || module is! SourcesFeatureModule) {
      return false;
    }

    final binder = provider.controller.binder;
    if (module.showSourceBindings) {
      final bindingsStore = binder.tryGet<SourceBindingsStore>();
      final interestCoveragePlanStore = binder
          .tryGet<InterestCoveragePlanStore>();
      final scanPolicyStore = binder.tryGet<ScanPolicyStore>();
      final scanRunStore = binder.tryGet<ScanRunStore>();
      if (bindingsStore == null ||
          interestCoveragePlanStore == null ||
          scanPolicyStore == null ||
          scanRunStore == null) {
        return false;
      }
      _module = module;
      _bindingsStore = bindingsStore;
      _interestCoveragePlanStore = interestCoveragePlanStore;
      _scanPolicyStore = scanPolicyStore;
      _scanRunStore = scanRunStore;
      _resolveTimer?.cancel();
      _resolveTimer = null;
      return true;
    }
    if (module.showSourceProfiles) {
      final profilesStore = binder.tryGet<SourceProfilesStore>();
      if (profilesStore == null) {
        return false;
      }
      _module = module;
      _profilesStore = profilesStore;
      _resolveTimer?.cancel();
      _resolveTimer = null;
      return true;
    }
    _module = module;
    _resolveTimer?.cancel();
    _resolveTimer = null;
    return true;
  }

  @override
  void dispose() {
    _resolveTimer?.cancel();
    _profilesStore?.dispose();
    _bindingsStore?.dispose();
    _interestCoveragePlanStore?.dispose();
    _scanPolicyStore?.dispose();
    _scanRunStore?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    _resolveModuleBindings();
    final module = _module;
    if (module == null) {
      return const Center(
        child: Text('Loading sources', textDirection: TextDirection.ltr),
      );
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
      final interestCoveragePlanStore = _interestCoveragePlanStore;
      final policyStore = _scanPolicyStore;
      final scanRunStore = _scanRunStore;
      if (store == null ||
          interestCoveragePlanStore == null ||
          policyStore == null ||
          scanRunStore == null) {
        return const SizedBox.shrink();
      }
      return SourceBindingsPage(
        store: store,
        interestCoveragePlanStore: interestCoveragePlanStore,
        policyStore: policyStore,
        scanRunStore: scanRunStore,
      );
    }
    return const SizedBox.shrink();
  }
}
