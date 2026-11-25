import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

class SourceProfileFactGrid extends StatelessWidget {
  const SourceProfileFactGrid({super.key, required this.facts});

  final List<SourceProfileFact> facts;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= 560 ? 3 : 2;
        return Wrap(
          spacing: AppSpacing.md,
          runSpacing: AppSpacing.md,
          children: facts
              .map((fact) {
                return SizedBox(
                  width:
                      (constraints.maxWidth - (AppSpacing.md * (columns - 1))) /
                      columns,
                  child: _SourceProfileFactTile(fact: fact),
                );
              })
              .toList(growable: false),
        );
      },
    );
  }
}

final class SourceProfileFact {
  const SourceProfileFact({required this.label, required this.value});

  final String label;
  final String value;
}

class _SourceProfileFactTile extends StatelessWidget {
  const _SourceProfileFactTile({required this.fact});

  final SourceProfileFact fact;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          fact.label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: textTheme.labelSmall?.copyWith(letterSpacing: 0),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          fact.value,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.w700,
            letterSpacing: 0,
          ),
        ),
      ],
    );
  }
}
