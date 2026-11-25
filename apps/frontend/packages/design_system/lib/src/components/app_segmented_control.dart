import 'package:flutter/material.dart';

import 'tooltip/app_tooltip.dart';

/// One option of an [AppSegmentedControl].
final class AppSegment<T extends Object> {
  const AppSegment({
    required this.value,
    required this.label,
    this.icon,
    this.tooltip,
    this.semanticLabel,
    this.key,
  });

  final T value;

  /// Short visible label; keep it to one or two words.
  final String label;
  final IconData? icon;
  final String? tooltip;

  /// Screen reader label when the visible [label] needs more context.
  final String? semanticLabel;

  /// Stable key on the segment label, for tests and automation.
  final Key? key;
}

/// Single-choice segmented control for compact toolbars.
///
/// Wraps Material [SegmentedButton] so every segment is a focusable button:
/// Tab moves between segments, Enter or Space selects one, and assistive
/// technology hears each segment as selected or not inside a mutually
/// exclusive group named by [semanticLabel]. The selected segment cannot be
/// cleared. A `null` [onChanged] disables the whole control.
///
/// Visual tokens follow the 36 px toolbar controls: outline border, 10 px
/// radius and a tinted selected segment. The height stays 36 px (above the
/// WCAG 2.2 AA 24 px target minimum) so it lines up with neighbouring filter
/// and view controls; text scaling grows the segments.
class AppSegmentedControl<T extends Object> extends StatelessWidget {
  const AppSegmentedControl({
    super.key,
    required this.segments,
    required this.selected,
    required this.onChanged,
    required this.semanticLabel,
    this.expanded = false,
  }) : assert(segments.length >= 2, 'A segmented control needs two options.');

  final List<AppSegment<T>> segments;
  final T selected;
  final ValueChanged<T>? onChanged;

  /// Name of the whole choice, for example `Top posts order`.
  final String semanticLabel;

  /// Fill the available width with equal segments (compact toolbars). Needs a
  /// bounded width; otherwise the control keeps its intrinsic width.
  final bool expanded;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final onChanged = this.onChanged;
    return Semantics(
      container: true,
      explicitChildNodes: true,
      label: semanticLabel,
      child: SegmentedButton<T>(
        expandedInsets: expanded ? EdgeInsets.zero : null,
        segments: [
          for (final segment in segments)
            ButtonSegment<T>(
              value: segment.value,
              icon: segment.icon == null ? null : Icon(segment.icon),
              label: AppTooltip(
                message: segment.tooltip,
                child: Text(
                  segment.label,
                  key: segment.key,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  semanticsLabel: segment.semanticLabel,
                ),
              ),
            ),
        ],
        selected: {selected},
        onSelectionChanged: onChanged == null
            ? null
            : (selection) => onChanged(selection.single),
        showSelectedIcon: false,
        style: _appSegmentedControlStyle(theme),
      ),
    );
  }
}

ButtonStyle _appSegmentedControlStyle(ThemeData theme) {
  final colorScheme = theme.colorScheme;
  return ButtonStyle(
    visualDensity: const VisualDensity(horizontal: -2, vertical: -1),
    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
    padding: const WidgetStatePropertyAll(EdgeInsets.symmetric(horizontal: 12)),
    iconSize: const WidgetStatePropertyAll(15),
    textStyle: WidgetStatePropertyAll(
      theme.textTheme.labelMedium?.copyWith(
        fontWeight: FontWeight.w600,
        letterSpacing: 0,
      ),
    ),
    shape: const WidgetStatePropertyAll(
      RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(10)),
      ),
    ),
    side: WidgetStateProperty.resolveWith((states) {
      if (states.contains(WidgetState.disabled)) {
        return BorderSide(
          color: colorScheme.outlineVariant.withValues(alpha: 0.6),
        );
      }
      return BorderSide(
        color: states.contains(WidgetState.focused)
            ? colorScheme.primary
            : colorScheme.outlineVariant,
      );
    }),
    backgroundColor: WidgetStateProperty.resolveWith((states) {
      if (states.contains(WidgetState.selected)) {
        return colorScheme.primary.withValues(
          alpha: states.contains(WidgetState.disabled) ? 0.04 : 0.1,
        );
      }
      return colorScheme.surface;
    }),
    foregroundColor: WidgetStateProperty.resolveWith((states) {
      if (states.contains(WidgetState.disabled)) {
        return colorScheme.onSurface.withValues(alpha: 0.38);
      }
      return states.contains(WidgetState.selected)
          ? colorScheme.primary
          : colorScheme.onSurfaceVariant;
    }),
    iconColor: WidgetStateProperty.resolveWith((states) {
      if (states.contains(WidgetState.disabled)) {
        return colorScheme.onSurface.withValues(alpha: 0.38);
      }
      return states.contains(WidgetState.selected)
          ? colorScheme.primary
          : colorScheme.onSurfaceVariant;
    }),
    overlayColor: WidgetStateProperty.resolveWith((states) {
      if (states.contains(WidgetState.focused) ||
          states.contains(WidgetState.pressed)) {
        return colorScheme.primary.withValues(alpha: 0.12);
      }
      if (states.contains(WidgetState.hovered)) {
        return colorScheme.primary.withValues(alpha: 0.05);
      }
      return null;
    }),
    mouseCursor: WidgetStateProperty.resolveWith(
      (states) =>
          states.contains(WidgetState.disabled) ||
              states.contains(WidgetState.selected)
          ? SystemMouseCursors.basic
          : SystemMouseCursors.click,
    ),
  );
}
