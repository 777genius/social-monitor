import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/source_interest_id.dart';
import '../composition/sources_feature_module.dart';
import '../composition/sources_feature_module_host.dart';
import '../stores/source_bindings_store.dart';
import '../stores/source_profiles_store.dart';

class SourcesFeatureRoute extends StatelessWidget {
  SourcesFeatureRoute.sourceProfilesDemo({super.key})
    : _module = SourcesFeatureModule.sourceProfilesDemo();

  SourcesFeatureRoute.generatedApi({
    super.key,
    required Object generatedApiRuntime,
    required WorkspaceScope scope,
  }) : _module = SourcesFeatureModule.generatedApi(
         generatedApiRuntime: generatedApiRuntime,
         scope: scope,
       );

  SourcesFeatureRoute.sourceBindings({
    super.key,
    required Object generatedApiRuntime,
    required WorkspaceScope scope,
    required String interestId,
    required String interestTitle,
  }) : _module = SourcesFeatureModule.sourceBindings(
         generatedApiRuntime: generatedApiRuntime,
         scope: scope,
         sourceBindingInterestId: SourceInterestId(interestId),
         sourceBindingInterestTitle: interestTitle,
       );

  SourcesFeatureRoute.sourceBindingsDemo({
    super.key,
    required String interestId,
    required String interestTitle,
  }) : _module = SourcesFeatureModule.sourceBindingsDemo(
         sourceBindingInterestId: SourceInterestId(interestId),
         sourceBindingInterestTitle: interestTitle,
       );

  final SourcesFeatureModule _module;

  @override
  Widget build(BuildContext context) {
    const host = SourcesFeatureModuleHost();
    return ModuleScope<SourcesFeatureModule>(
      module: _module,
      retentionPolicy: ModuleRetentionPolicy.routeBound,
      retentionKey: _module.retentionKey,
      loadingBuilder: (context) => const _LoadedModuleFallback(child: host),
      child: host,
    );
  }
}

class _LoadedModuleFallback extends StatefulWidget {
  const _LoadedModuleFallback({required this.child});

  final Widget child;

  @override
  State<_LoadedModuleFallback> createState() => _LoadedModuleFallbackState();
}

class _LoadedModuleFallbackState extends State<_LoadedModuleFallback> {
  Timer? _statusCheckTimer;

  @override
  void initState() {
    super.initState();
    _statusCheckTimer = Timer.periodic(const Duration(milliseconds: 50), (_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _statusCheckTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.getInheritedWidgetOfExactType<ModuleProvider>();
    final binder = provider?.controller.binder;
    final isLoaded = _canResolveStore(binder);
    if (isLoaded) {
      _statusCheckTimer?.cancel();
      return widget.child;
    }

    return const Center(
      child: Text('Loading sources', textDirection: TextDirection.ltr),
    );
  }
}

bool _canResolveStore(Binder? binder) {
  if (binder == null) {
    return false;
  }
  return _canResolve<SourceProfilesStore>(binder) ||
      _canResolve<SourceBindingsStore>(binder);
}

bool _canResolve<T extends Object>(Binder binder) {
  try {
    binder.get<T>();
    return true;
  } catch (_) {
    return false;
  }
}
