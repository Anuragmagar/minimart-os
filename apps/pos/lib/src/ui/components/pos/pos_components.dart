import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:pos/src/theme/app_theme_tokens.dart';
import 'package:pos/src/ui/components/primitives/app_primitives.dart';

/// A numeric keypad for quantity and price entry.
///
/// Designed for POS speed: large targets, haptic feedback, and a clear
/// visual hierarchy. The `onSubmit` callback receives the completed value
/// as a [String] so the caller can parse to [Decimal] / [double] / [int]
/// using its own policy.
class NumericKeypad extends StatefulWidget {
  const NumericKeypad({
    super.key,
    required this.onSubmit,
    this.initialValue = '',
    this.decimalAllowed = true,
    this.maxLength = 18,
    this.label = 'Enter amount',
    this.submitLabel = 'OK',
  });

  final ValueChanged<String> onSubmit;
  final String initialValue;
  final bool decimalAllowed;
  final int maxLength;
  final String label;
  final String submitLabel;

  @override
  State<NumericKeypad> createState() => _NumericKeypadState();
}

class _NumericKeypadState extends State<NumericKeypad> {
  late String _value;

  @override
  void initState() {
    super.initState();
    _value = widget.initialValue;
  }

  void _addDigit(String digit) {
    if (_value.length >= widget.maxLength) return;
    HapticFeedback.selectionClick();
    setState(() => _value += digit);
  }

  void _addDecimal() {
    if (!widget.decimalAllowed) return;
    if (_value.contains('.')) return;
    if (_value.isEmpty) {
      _value = '0.';
    } else {
      _value += '.';
    }
    HapticFeedback.selectionClick();
    setState(() {});
  }

  void _backspace() {
    if (_value.isEmpty) return;
    HapticFeedback.selectionClick();
    setState(() => _value = _value.substring(0, _value.length - 1));
  }

  void _clear() {
    if (_value.isEmpty) return;
    HapticFeedback.heavyImpact();
    setState(() => _value = '');
  }

  void _submit() {
    if (_value.isEmpty) return;
    HapticFeedback.mediumImpact();
    widget.onSubmit(_value);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Display
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(AppSpacing.lg),
          decoration: BoxDecoration(
            color: scheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(AppBorderRadius.lg),
            border: Border.all(color: scheme.outlineVariant),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                widget.label,
                style: theme.textTheme.labelMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                _value.isEmpty ? '0' : _value,
                style: theme.textTheme.displayMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: scheme.onSurface,
                ),
                textAlign: TextAlign.end,
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        // Keypad grid
        LayoutBuilder(
          builder: (context, constraints) {
            final buttonSize = (constraints.maxWidth - 2 * AppSpacing.md) / 3;
            return Column(
              children: [
                _buildRow(['1', '2', '3'], buttonSize),
                const SizedBox(height: AppSpacing.sm),
                _buildRow(['4', '5', '6'], buttonSize),
                const SizedBox(height: AppSpacing.sm),
                _buildRow(['7', '8', '9'], buttonSize),
                const SizedBox(height: AppSpacing.sm),
                _buildBottomRow(buttonSize),
              ],
            );
          },
        ),
      ],
    );
  }

  Widget _buildRow(List<String> digits, double buttonSize) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: digits.map((d) => _KeypadButton(d, onTap: () => _addDigit(d), size: buttonSize)).toList(),
    );
  }

  Widget _buildBottomRow(double buttonSize) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _KeypadButton(
          widget.decimalAllowed ? '.' : 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«',
          onTap: widget.decimalAllowed ? _addDecimal : _backspace,
          size: buttonSize,
          isSecondary: widget.decimalAllowed,
        ),
        _KeypadButton('0', onTap: () => _addDigit('0'), size: buttonSize),
        _KeypadButton(
          widget.decimalAllowed ? 'ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã¢â‚¬Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â«' : widget.submitLabel,
          onTap: widget.decimalAllowed ? _backspace : _submit,
          size: buttonSize,
          isSecondary: !widget.decimalAllowed,
          isSubmit: !widget.decimalAllowed,
        ),
      ],
    );
  }
}

class _KeypadButton extends StatelessWidget {
  const _KeypadButton(
    this.label, {
    required this.onTap,
    required this.size,
    this.isSecondary = false,
    this.isSubmit = false,
  });

  final String label;
  final VoidCallback onTap;
  final double size;
  final bool isSecondary;
  final bool isSubmit;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final bg = isSubmit
        ? scheme.primary
        : isSecondary
            ? scheme.surfaceContainerHighest
            : scheme.surfaceContainer;
    final fg = isSubmit
        ? scheme.onPrimary
        : scheme.onSurface;

    return SizedBox(
      width: size,
      height: size,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(AppBorderRadius.lg),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppBorderRadius.lg),
          child: Center(
            child: Text(
              label,
              style: theme.textTheme.headlineMedium?.copyWith(
                color: fg,
                fontWeight: isSubmit ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Displays a monetary value using the app's Decimal type.
///
/// Accepts a [Decimal] or a numeric string/number and formats it as a
/// locale-aware currency using the provided currency symbol and decimal
/// places. The formatting is purely presentational; callers must not rely on
/// this for arithmetic.
class MoneyDisplay extends StatelessWidget {
  const MoneyDisplay({
    super.key,
    required this.amount,
    this.currencySymbol = 'Rs',
    this.decimalPlaces = 2,
    this.style,
    this.showSymbol = true,
    this.negativeStyle,
  });

  /// The amount to display. Can be a Decimal, num, or String.
  final dynamic amount;
  final String currencySymbol;
  final int decimalPlaces;
  final TextStyle? style;
  final bool showSymbol;
  final TextStyle? negativeStyle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    final formatted = _formatAmount(amount);
    final isNegative = _isNegative(amount);
    final effectiveStyle = isNegative && negativeStyle != null
        ? (style ?? theme.textTheme.bodyLarge)!.merge(negativeStyle!)
        : style ?? theme.textTheme.bodyLarge;

    return Text(
      showSymbol ? '$currencySymbol $formatted' : formatted,
      style: effectiveStyle?.copyWith(
        color: isNegative ? scheme.error : scheme.onSurface,
        fontWeight: FontWeight.w600,
        fontFamily: 'RobotoMono',
      ),
    );
  }

  String _formatAmount(dynamic amount) {
    // Handle Decimal type (our custom type with toString)
    if (amount.runtimeType.toString().contains('Decimal')) {
      // Decimal has a toString that gives proper decimal representation
      final str = amount.toString();
      // Ensure correct decimal places
      if (str.contains('.')) {
        final parts = str.split('.');
        final decimals = parts[1].padRight(decimalPlaces, '0');
        return '${parts[0]}.${decimals.substring(0, decimalPlaces)}';
      }
      return '${str}.${'0' * decimalPlaces}';
    }
    // Handle num
    if (amount is num) {
      return amount.toStringAsFixed(decimalPlaces);
    }
    // Handle String
    if (amount is String) {
      final parsed = double.tryParse(amount);
      if (parsed != null) {
        return parsed.toStringAsFixed(decimalPlaces);
      }
      return amount;
    }
    return '0.${'0' * decimalPlaces}';
  }

  bool _isNegative(dynamic amount) {
    if (amount.runtimeType.toString().contains('Decimal')) {
      final str = amount.toString();
      return str.startsWith('-');
    }
    if (amount is num) return amount < 0;
    if (amount is String) return amount.startsWith('-');
    return false;
  }
}

/// Quantity input with increment/decrement buttons and optional keypad.
///
/// Combines a compact stepper with an optional [NumericKeypad] for precise
/// entry. The value is kept as a String so the caller controls Decimal parsing.
class QuantityInput extends StatefulWidget {
  const QuantityInput({
    super.key,
    required this.value,
    required this.onChanged,
    this.step = 1,
    this.min = 0,
    this.max = 999999,
    this.decimalPlaces = 3,
    this.showKeypad = true,
    this.label = 'Qty',
  });

  final String value;
  final ValueChanged<String> onChanged;
  final int step;
  final int min;
  final int max;
  final int decimalPlaces;
  final bool showKeypad;
  final String label;

  @override
  State<QuantityInput> createState() => _QuantityInputState();
}

class _QuantityInputState extends State<QuantityInput> {
  late TextEditingController _controller;
  bool _showKeypad = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.value);
    _showKeypad = widget.showKeypad;
  }

  @override
  void didUpdateWidget(covariant QuantityInput oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.value != widget.value) {
      _controller.text = widget.value;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _increment() {
    final current = double.tryParse(_controller.text) ?? 0;
    final next = (current + widget.step).clamp(widget.min, widget.max).toString();
    _controller.text = next;
    widget.onChanged(next);
  }

  void _decrement() {
    final current = double.tryParse(_controller.text) ?? 0;
    final next = (current - widget.step).clamp(widget.min, widget.max).toString();
    _controller.text = next;
    widget.onChanged(next);
  }

  void _onKeypadResult(String val) {
    final clamped = double.parse(val).clamp(widget.min, widget.max).toString();
    _controller.text = clamped;
    widget.onChanged(clamped);
    setState(() => _showKeypad = false);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (widget.label.isNotEmpty) ...[
          Text(widget.label, style: theme.textTheme.labelMedium),
          const SizedBox(height: AppSpacing.xs),
        ],
        Row(
          children: [
            // Decrement
            IconButton.filled(
              onPressed: _decrement,
              icon: const Icon(Icons.remove),
              style: IconButton.styleFrom(
                minimumSize: const Size(48, 48),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppBorderRadius.md),
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            // Text field
            Expanded(
              child: AppTextField(
                controller: _controller,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                textAlign: TextAlign.center,
                onChanged: widget.onChanged,
                onSubmitted: (_) => FocusScope.of(context).unfocus(),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            // Increment
            IconButton.filled(
              onPressed: _increment,
              icon: const Icon(Icons.add),
              style: IconButton.styleFrom(
                minimumSize: const Size(48, 48),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(AppBorderRadius.md),
                ),
              ),
            ),
          ],
        ),
        if (widget.showKeypad && _showKeypad) ...[
          const SizedBox(height: AppSpacing.md),
          NumericKeypad(
            initialValue: _controller.text,
            decimalAllowed: widget.decimalPlaces > 0,
            onSubmit: _onKeypadResult,
          ),
        ],
        if (widget.showKeypad)
          TextButton.icon(
            onPressed: () => setState(() => _showKeypad = !_showKeypad),
            icon: Icon(_showKeypad ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down),
            label: Text(_showKeypad ? 'Hide keypad' : 'Show keypad'),
          ),
      ],
    );
  }
}

/// A product card for the POS product grid.
///
/// Shows image placeholder, name, SKU, price, and stock badge. Tap to add to
/// sale, long-press for options (future).
class ProductCard extends StatelessWidget {
  const ProductCard({
    super.key,
    required this.name,
    required this.sku,
    required this.price,
    this.imageUrl,
    this.stock,
    this.onTap,
    this.onLongPress,
    this.isLowStock = false,
    this.isOutOfStock = false,
  });

  final String name;
  final String sku;
  final dynamic price; // Decimal or num
  final String? imageUrl;
  final int? stock;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final bool isLowStock;
  final bool isOutOfStock;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return AppCard(
      onTap: onTap,
      onLongPress: onLongPress,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Image area
          AspectRatio(
            aspectRatio: 1,
            child: Container(
              color: scheme.surfaceContainerHighest,
              child: imageUrl != null
                  ? Image.network(imageUrl!, fit: BoxFit.cover)
                  : Icon(
                      Icons.inventory_2_outlined,
                      size: 48,
                      color: scheme.onSurfaceVariant.withValues(alpha: 0.5),
                    ),
            ),
          ),
          // Content
          Padding(
            padding: const EdgeInsets.all(AppSpacing.sm),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  sku,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Row(
                  children: [
                    MoneyDisplay(amount: price, style: theme.textTheme.titleMedium),
                    const Spacer(),
                    if (stock != null)
                      AppBadge(
                        label: isOutOfStock ? 'OUT' : (isLowStock ? 'LOW' : 'OK'),
                        variant: isOutOfStock
                            ? AppBadgeVariant.error
                            : isLowStock
                                ? AppBadgeVariant.warning
                                : AppBadgeVariant.success,
                      ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// A receipt line item for POS and sales history.
class ReceiptLine extends StatelessWidget {
  const ReceiptLine({
    super.key,
    required this.name,
    required this.quantity,
    required this.unitPrice,
    required this.total,
    this.sku,
    this.discount = 0,
    this.tax = 0,
  });

  final String name;
  final dynamic quantity;
  final dynamic unitPrice;
  final dynamic total;
  final String? sku;
  final dynamic discount;
  final dynamic tax;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w500)),
                    if (sku != null)
                      Text(sku!, style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant)),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${_fmt(quantity)} ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ${_fmtPrice(unitPrice)}',
                    style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                  MoneyDisplay(amount: total),
                ],
              ),
            ],
          ),
          if (discount != 0 || tax != 0) ...[
            const SizedBox(height: AppSpacing.xs),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (discount != 0)
                  Text(
                    'Disc: ${_fmtPrice(discount)}',
                    style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                  ),
                if (discount != 0 && tax != 0) const SizedBox(width: AppSpacing.md),
                if (tax != 0)
                  Text(
                    'Tax: ${_fmtPrice(tax)}',
                    style: theme.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  String _fmt(dynamic v) {
    if (v.runtimeType.toString().contains('Decimal')) return v.toString();
    if (v is num) return v.toString();
    return v.toString();
  }

  String _fmtPrice(dynamic v) {
    if (v.runtimeType.toString().contains('Decimal')) return 'Rs ${v.toString()}';
    if (v is num) return 'Rs ${v.toStringAsFixed(2)}';
    return 'Rs $v';
  }
}