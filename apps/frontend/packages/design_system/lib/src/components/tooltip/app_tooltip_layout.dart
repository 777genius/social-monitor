part of 'app_tooltip.dart';

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
