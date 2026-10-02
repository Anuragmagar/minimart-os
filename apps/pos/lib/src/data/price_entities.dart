import 'package:pos/src/database/decimal.dart';

/// Domain view of a barcode assigned to a product.
///
/// A value is unique per organization rather than per product (ASM-052), which
/// is why [organizationId] is carried on the barcode itself rather than being
/// reached through the product.
class ProductBarcodeEntry {
  final String id;
  final String organizationId;
  final String productId;
  final String barcode;
  final String? barcodeType;
  final bool isPrimary;

  const ProductBarcodeEntry({
    required this.id,
    required this.organizationId,
    required this.productId,
    required this.barcode,
    required this.isPrimary,
    this.barcodeType,
  });

  @override
  bool operator ==(Object other) =>
      other is ProductBarcodeEntry &&
      other.id == id &&
      other.organizationId == organizationId &&
      other.productId == productId &&
      other.barcode == barcode &&
      other.barcodeType == barcodeType &&
      other.isPrimary == isPrimary;

  @override
  int get hashCode =>
      Object.hash(id, organizationId, productId, barcode, barcodeType, isPrimary);

  @override
  String toString() =>
      'ProductBarcodeEntry(barcode: $barcode, productId: $productId, '
      'isPrimary: $isPrimary)';
}

/// Domain view of a single price period for a product.
///
/// A price period is append-only history (ASM-054): the amount, the price type
/// and the start of the window are immutable once written, and a price change
/// is a retirement plus an insert rather than an in-place edit. This is the
/// reason [effectiveTo] is the only part of a period that ever moves.
class ProductPricePeriod {
  final String id;
  final String productId;
  final String priceType;
  final Decimal amount;

  /// Start of the window, inclusive.
  final DateTime effectiveFrom;

  /// End of the window, exclusive. Null means open-ended.
  final DateTime? effectiveTo;

  const ProductPricePeriod({
    required this.id,
    required this.productId,
    required this.priceType,
    required this.amount,
    required this.effectiveFrom,
    this.effectiveTo,
  });

  /// True when [at] falls inside this period.
  ///
  /// Half-open `[effectiveFrom, effectiveTo)`, with a null end meaning
  /// open-ended. This is byte-for-byte the same rule the server applies in
  /// 05.08 (`start < candidateEnd && candidateFrom < end`, a null end read as
  /// positive infinity), so offline pricing agrees with server pricing by
  /// construction rather than by coincidence.
  ///
  /// Half-open rather than closed matters at the seam: a successor starting at
  /// exactly the instant its predecessor ends is legal, so an instant that
  /// equals [effectiveTo] must resolve to the successor, not to both.
  bool isEffectiveAt(DateTime at) {
    if (at.isBefore(effectiveFrom)) return false;
    final end = effectiveTo;
    return end == null || at.isBefore(end);
  }

  /// True while the period has not started yet.
  ///
  /// The server refuses to delete a period that has taken effect and permits
  /// deleting one that is strictly in the future (ASM-054). This mirrors that
  /// so an offline device does not offer a deletion the server will refuse.
  bool get isNotYetStarted => effectiveFrom.isAfter(DateTime.now().toUtc());

  @override
  bool operator ==(Object other) =>
      other is ProductPricePeriod &&
      other.id == id &&
      other.productId == productId &&
      other.priceType == priceType &&
      other.amount == amount &&
      other.effectiveFrom == effectiveFrom &&
      other.effectiveTo == effectiveTo;

  @override
  int get hashCode => Object.hash(
    id,
    productId,
    priceType,
    amount,
    effectiveFrom,
    effectiveTo,
  );

  @override
  String toString() =>
      'ProductPricePeriod(productId: $productId, type: $priceType, '
      'amount: $amount, from: $effectiveFrom, to: $effectiveTo)';
}
