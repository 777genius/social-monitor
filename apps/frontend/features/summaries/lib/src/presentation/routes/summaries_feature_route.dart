import 'package:flutter/widgets.dart';
import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../composition/summaries_feature_module.dart';
import '../composition/summaries_feature_module_host.dart';

class SummariesFeatureRoute extends StatelessWidget {
  SummariesFeatureRoute({super.key}) : _module = SummariesFeatureModule();

  SummariesFeatureRoute.generatedApi({
    super.key,
    required Object generatedApiRuntime,
    required WorkspaceScope scope,
    required String userId,
  }) : _module = SummariesFeatureModule.generatedApi(
         generatedApiRuntime: generatedApiRuntime,
         scope: scope,
         userId: userId,
       );

  final SummariesFeatureModule _module;

  @override
  Widget build(BuildContext context) {
    const host = SummariesFeatureModuleHost();
    return ModuleScope<SummariesFeatureModule>(
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
  bool _checkScheduled = false;

  @override
  Widget build(BuildContext context) {
    final provider = context.getInheritedWidgetOfExactType<ModuleProvider>();
    final status = provider?.controller.currentStatus;
    if (status == ModuleStatus.loaded) {
      return widget.child;
    }

    _scheduleStatusCheck();
    return const Center(
      child: Text('Loading...', textDirection: TextDirection.ltr),
    );
  }

  void _scheduleStatusCheck() {
    if (_checkScheduled) {
      return;
    }
    _checkScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      setState(() {
        _checkScheduled = false;
      });
    });
  }
}
