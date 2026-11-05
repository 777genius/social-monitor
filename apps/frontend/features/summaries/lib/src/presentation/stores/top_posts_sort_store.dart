import 'package:flutter/foundation.dart';

import '../../application/use_cases/load_top_posts_sort_order_use_case.dart';
import '../../application/use_cases/remember_top_posts_sort_order_use_case.dart';
import '../../domain/value_objects/top_posts_sort_order.dart';

/// Reader-chosen order of the Top posts lanes.
///
/// The remembered order is read synchronously on construction, so the first
/// frame after a page reload already shows it. One store is shared by both
/// lanes and survives period changes inside the page.
final class TopPostsSortStore extends ChangeNotifier {
  TopPostsSortStore({
    required LoadTopPostsSortOrderUseCase loadSortOrder,
    required RememberTopPostsSortOrderUseCase rememberSortOrder,
  }) : _rememberSortOrder = rememberSortOrder,
       _order = loadSortOrder.execute();

  final RememberTopPostsSortOrderUseCase _rememberSortOrder;
  TopPostsSortOrder _order;

  TopPostsSortOrder get order => _order;

  void select(TopPostsSortOrder order) {
    if (_order == order) {
      return;
    }
    _order = order;
    _rememberSortOrder.execute(order);
    notifyListeners();
  }
}
