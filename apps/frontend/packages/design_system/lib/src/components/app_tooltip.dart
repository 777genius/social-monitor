import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// A passive hint whose hover region never blocks the page underneath it.
class AppTooltip extends StatefulWidget {
  const AppTooltip({
    super.key,
    this.message,
    this.richMessage,
    this.preferBelow,
    this.waitDuration,
    this.triggerMode,
    required this.child,
  }) : assert(message == null || richMessage == null);

  final String? message;
  final InlineSpan? richMessage;
  final bool? preferBelow;
  final Duration? waitDuration;
  final TooltipTriggerMode? triggerMode;
  final Widget child;

  @override
  State<AppTooltip> createState() => _AppTooltipState();
}

class _AppTooltipState extends State<AppTooltip> {
  final _overlay = OverlayPortalController();
  Timer? _timer;
  bool _focused = false;
  bool _visible = true;
  TooltipThemeData _theme = const TooltipThemeData();

  String get _message =>
      widget.message ?? widget.richMessage?.toPlainText() ?? '';

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _visible = TooltipVisibility.of(context);
    _theme = TooltipTheme.of(context);
    if (!_visible) _dismissAfterBuild();
  }

  @override
  void didUpdateWidget(covariant AppTooltip oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (_message.isEmpty) _dismissAfterBuild();
  }

  void _dismissAfterBuild() {
    _timer?.cancel();
    if (!_overlay.isShowing) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _overlay.isShowing && (!_visible || _message.isEmpty)) {
        _overlay.hide();
      }
    });
  }

  void _scheduleShow() {
    _timer?.cancel();
    final delay = widget.waitDuration ?? _theme.waitDuration ?? Duration.zero;
    _timer = Timer(delay, _show);
  }

  bool _show() {
    _timer?.cancel();
    if (!mounted || !_visible || _message.isEmpty || _overlay.isShowing) {
      return false;
    }
    _overlay.show();
    return true;
  }

  void _scheduleHide([Duration? delay]) {
    _timer?.cancel();
    if (_focused) return;
    _timer = Timer(
      delay ?? _theme.exitDuration ?? const Duration(milliseconds: 100),
      _hide,
    );
  }

  void _hide() {
    _timer?.cancel();
    if (mounted && _overlay.isShowing) _overlay.hide();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final message = _message;
    if (!_visible || message.isEmpty) return widget.child;
    final trigger =
        widget.triggerMode ??
        _theme.triggerMode ??
        TooltipTriggerMode.longPress;
    return OverlayPortal.overlayChildLayoutBuilder(
      controller: _overlay,
      overlayChildBuilder: _buildOverlay,
      child: Semantics(
        tooltip: (_theme.excludeFromSemantics ?? false) ? null : message,
        child: Focus(
          canRequestFocus: false,
          includeSemantics: false,
          skipTraversal: true,
          onFocusChange: (focused) {
            _focused = focused;
            if (focused) {
              _show();
            } else {
              _scheduleHide();
            }
          },
          onKeyEvent: (_, event) {
            if (_overlay.isShowing &&
                event is KeyDownEvent &&
                event.logicalKey == LogicalKeyboardKey.escape) {
              _hide();
              return KeyEventResult.handled;
            }
            return KeyEventResult.ignored;
          },
          child: MouseRegion(
            onEnter: (_) => _scheduleShow(),
            onExit: (_) => _scheduleHide(),
            child: GestureDetector(
              excludeFromSemantics: true,
              onLongPress: trigger == TooltipTriggerMode.longPress
                  ? _show
                  : null,
              onLongPressEnd: trigger == TooltipTriggerMode.longPress
                  ? (_) => _scheduleHide(
                      _theme.showDuration ?? const Duration(milliseconds: 1500),
                    )
                  : null,
              onTap: trigger == TooltipTriggerMode.tap
                  ? () {
                      _show();
                      _scheduleHide(
                        _theme.showDuration ??
                            const Duration(milliseconds: 1500),
                      );
                    }
                  : null,
              child: widget.child,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildOverlay(BuildContext context, OverlayChildLayoutInfo layout) {
    final target = MatrixUtils.transformPoint(
      layout.childPaintTransform,
      layout.childSize.center(Offset.zero),
    );
    final theme = Theme.of(context);
    final compact = switch (theme.platform) {
      TargetPlatform.macOS ||
      TargetPlatform.linux ||
      TargetPlatform.windows => true,
      TargetPlatform.android ||
      TargetPlatform.fuchsia ||
      TargetPlatform.iOS => false,
    };
    final dark = theme.brightness == Brightness.dark;
    return Positioned.fill(
      bottom: MediaQuery.maybeViewInsetsOf(context)?.bottom ?? 0,
      child: CustomSingleChildLayout(
        delegate: _TooltipLayout(
          target: target,
          verticalOffset: _theme.verticalOffset ?? 24,
          preferBelow: widget.preferBelow ?? _theme.preferBelow ?? true,
        ),
        child: MouseRegion(
          // Register hover without claiming the overlay's hit-test area.
          opaque: false,
          hitTestBehavior: HitTestBehavior.translucent,
          onEnter: (_) => _timer?.cancel(),
          onExit: (_) => _scheduleHide(),
          child: IgnorePointer(
            child: SelectionContainer.disabled(
              child: Container(
                constraints:
                    _theme.constraints ??
                    BoxConstraints(minHeight: compact ? 24 : 32),
                margin: _theme.margin,
                padding:
                    _theme.padding ??
                    EdgeInsets.symmetric(
                      horizontal: compact ? 8 : 16,
                      vertical: 4,
                    ),
                decoration:
                    _theme.decoration ??
                    BoxDecoration(
                      color: (dark ? Colors.white : Colors.grey[700]!)
                          .withValues(alpha: 0.9),
                      borderRadius: BorderRadius.circular(4),
                    ),
                child: Text.rich(
                  widget.richMessage ?? TextSpan(text: widget.message),
                  style:
                      _theme.textStyle ??
                      theme.textTheme.bodyMedium!.copyWith(
                        color: dark ? Colors.black : Colors.white,
                        fontSize: compact ? 12 : 14,
                      ),
                  textAlign: _theme.textAlign ?? TextAlign.start,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TooltipLayout extends SingleChildLayoutDelegate {
  const _TooltipLayout({
    required this.target,
    required this.verticalOffset,
    required this.preferBelow,
  });
  final Offset target;
  final double verticalOffset;
  final bool preferBelow;

  @override
  BoxConstraints getConstraintsForChild(BoxConstraints constraints) =>
      constraints.loosen().deflate(const EdgeInsets.all(10));

  @override
  Offset getPositionForChild(Size size, Size childSize) => positionDependentBox(
    size: size,
    childSize: childSize,
    target: target,
    verticalOffset: verticalOffset,
    preferBelow: preferBelow,
  );

  @override
  bool shouldRelayout(_TooltipLayout oldDelegate) =>
      target != oldDelegate.target ||
      verticalOffset != oldDelegate.verticalOffset ||
      preferBelow != oldDelegate.preferBelow;
}
