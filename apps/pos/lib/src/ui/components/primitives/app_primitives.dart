import 'package:flutter/material.dart';

import '../../../theme/app_theme_tokens.dart';

/// A themed button with consistent variants across the app.
///
/// Use this instead of raw ElevatedButton/TextButton/OutlinedButton to keep
/// visual and interaction behaviour uniform. The variants map to Material 3
/// semantics but are implemented with the app's token values so light/dark
/// themes work without extra code.
enum AppButtonVariant {
  /// Primary action ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â solid, high emphasis.
  primary,

  /// Secondary action ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â tonal container, medium emphasis.
  secondary,

  /// Tertiary action ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â text only, low emphasis.
  tertiary,

  /// Destructive action ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â error container, high emphasis.
  destructive,

  /// Outlined action ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â border only, medium emphasis.
  outlined,
}

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.onPressed,
    required this.label,
    this.variant = AppButtonVariant.primary,
    this.icon,
    this.isLoading = false,
    this.isFullWidth = false,
    this.tooltip,
  });

  final VoidCallback? onPressed;
  final String label;
  final AppButtonVariant variant;
  final Widget? icon;
  final bool isLoading;
  final bool isFullWidth;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final enabled = onPressed != null && !isLoading;

    final (ButtonStyle style, Color? foregroundColor) = _resolveStyle(
      theme,
      enabled,
    );

    final child = _LoadingAwareChild(
      isLoading: isLoading,
      enabled: enabled,
      label: label,
      icon: icon,
      foregroundColor: foregroundColor ?? theme.colorScheme.onSurface,
    );

    final button = switch (variant) {
      AppButtonVariant.primary => FilledButton(
          onPressed: enabled ? onPressed : null,
          style: style as ButtonStyle?,
          child: child,
        ),
      AppButtonVariant.secondary => FilledButton.tonal(
          onPressed: enabled ? onPressed : null,
          style: style as ButtonStyle?,
          child: child,
        ),
      AppButtonVariant.tertiary => TextButton(
          onPressed: enabled ? onPressed : null,
          style: style as ButtonStyle?,
          child: child,
        ),
      AppButtonVariant.destructive => FilledButton(
          onPressed: enabled ? onPressed : null,
          style: style as ButtonStyle?,
          child: child,
        ),
      AppButtonVariant.outlined => OutlinedButton(
          onPressed: enabled ? onPressed : null,
          style: style as ButtonStyle?,
          child: child,
        ),
    };

    final sized = isFullWidth
        ? SizedBox(width: double.infinity, child: button)
        : button;

    return tooltip != null ? Tooltip(message: tooltip!, child: sized) : sized;
  }

  (ButtonStyle, Color?) _resolveStyle(ThemeData theme, bool enabled) {
    final disabledOpacity = 0.38;
    final scheme = theme.colorScheme;

    if (variant == AppButtonVariant.primary) {
      return (
        FilledButton.styleFrom(
          backgroundColor: enabled
              ? scheme.primary
              : scheme.primary.withValues(alpha: disabledOpacity),
          foregroundColor: scheme.onPrimary,
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.md,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppBorderRadius.md),
          ),
          elevation: enabled ? AppElevation.level1 : 0,
          minimumSize: const Size(88, 48),
        ),
        scheme.onPrimary,
      );
    } else if (variant == AppButtonVariant.secondary) {
      return (
        FilledButton.styleFrom(
          backgroundColor: enabled
              ? scheme.secondaryContainer
              : scheme.secondaryContainer.withValues(alpha: disabledOpacity),
          foregroundColor: enabled
              ? scheme.onSecondaryContainer
              : scheme.onSecondaryContainer.withValues(alpha: disabledOpacity),
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.md,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppBorderRadius.md),
          ),
          elevation: 0,
          minimumSize: const Size(88, 48),
        ),
        scheme.onSecondaryContainer,
      );
    } else if (variant == AppButtonVariant.tertiary) {
      return (
        TextButton.styleFrom(
          foregroundColor: enabled
              ? scheme.primary
              : scheme.primary.withValues(alpha: disabledOpacity),
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.md,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppBorderRadius.md),
          ),
          minimumSize: const Size(88, 48),
        ),
        scheme.primary,
      );
    } else if (variant == AppButtonVariant.destructive) {
      return (
        FilledButton.styleFrom(
          backgroundColor: enabled
              ? scheme.error
              : scheme.error.withValues(alpha: disabledOpacity),
          foregroundColor: scheme.onError,
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.md,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppBorderRadius.md),
          ),
          elevation: enabled ? AppElevation.level1 : 0,
          minimumSize: const Size(88, 48),
        ),
        scheme.onError,
      );
    } else {
      // AppButtonVariant.outlined
      return (
        OutlinedButton.styleFrom(
          foregroundColor: enabled
              ? scheme.primary
              : scheme.primary.withValues(alpha: disabledOpacity),
          side: BorderSide(
            color: enabled
                ? scheme.outline
                : scheme.outline.withValues(alpha: disabledOpacity),
            width: 1.5,
          ),
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.md,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppBorderRadius.md),
          ),
          minimumSize: const Size(88, 48),
        ),
        scheme.primary,
      );
    }
  }
}

class _LoadingAwareChild extends StatelessWidget {
  const _LoadingAwareChild({
    required this.isLoading,
    required this.enabled,
    required this.label,
    this.icon,
    required this.foregroundColor,
  });

  final bool isLoading;
  final bool enabled;
  final String label;
  final Widget? icon;
  final Color foregroundColor;

  @override
  Widget build(BuildContext context) {
    if (isLoading) {
      return SizedBox(
        width: 20,
        height: 20,
        child: CircularProgressIndicator(
          strokeWidth: 2,
          valueColor: AlwaysStoppedAnimation<Color>(foregroundColor),
        ),
      );
    }
    if (icon != null) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconTheme(
            data: IconThemeData(
              color: enabled ? foregroundColor : foregroundColor.withValues(alpha: 0.38),
              size: 20,
            ),
            child: icon!,
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(label, style: Theme.of(context).textTheme.labelLarge),
        ],
      );
    }
    return Text(label, style: Theme.of(context).textTheme.labelLarge);
  }
}

/// A small badge showing a status or count.
///
/// Uses the app's state colours so it works in both themes without extra code.
class AppBadge extends StatelessWidget {
  const AppBadge({
    super.key,
    required this.label,
    this.variant = AppBadgeVariant.neutral,
    this.count,
    this.onTap,
  });

  final String label;
  final AppBadgeVariant variant;
  final int? count;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final (bg, fg) = switch (variant) {
      AppBadgeVariant.neutral => (
          theme.colorScheme.surfaceContainerHighest,
          theme.colorScheme.onSurfaceVariant,
        ),
      AppBadgeVariant.success => (
          AppColors.successContainer,
          AppColors.onSuccessContainer,
        ),
      AppBadgeVariant.warning => (
          AppColors.warningContainer,
          AppColors.onWarningContainer,
        ),
      AppBadgeVariant.error => (
          theme.colorScheme.errorContainer,
          theme.colorScheme.onErrorContainer,
        ),
      AppBadgeVariant.info => (
          AppColors.infoContainer,
          AppColors.onInfoContainer,
        ),
    };

    final child = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(
            color: fg,
            fontWeight: FontWeight.w600,
          ),
        ),
        if (count != null && count! > 0) ...[
          const SizedBox(width: AppSpacing.xs),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.xs,
              vertical: 1,
            ),
            decoration: BoxDecoration(
              color: variant == AppBadgeVariant.success
                  ? AppColors.success
                  : theme.colorScheme.error,
              borderRadius: BorderRadius.circular(AppBorderRadius.full),
            ),
            child: Text(
              count.toString(),
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onPrimary,
                fontWeight: FontWeight.w700,
                fontSize: 10,
              ),
            ),
          ),
        ],
      ],
    );

    return onTap != null
        ? InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppBorderRadius.full),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.xs,
              ),
              child: child,
            ),
          )
        : Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.xs,
            ),
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(AppBorderRadius.full),
            ),
            child: child,
          );
  }
}

enum AppBadgeVariant {
  neutral,
  success,
  warning,
  error,
  info,
}

/// A card with consistent elevation, radius, and padding.
///
/// Prefer this over raw `Card` so the whole app uses the same visual language.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.md),
    this.elevation = AppElevation.level1,
    this.onTap,
    this.onLongPress,
    this.margin,
    this.color,
    this.border,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double elevation;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final EdgeInsetsGeometry? margin;
  final Color? color;
  final BoxBorder? border;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final card = Card(
      elevation: elevation,
      margin: margin ?? EdgeInsets.zero,
      color: color ?? theme.colorScheme.surfaceContainer,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.md),
        side: ((border is BorderSide) ? border! : BorderSide.none) as BorderSide,
      ),
      child: Padding(padding: padding, child: child),
    );

    final hasTap = onTap != null;
    final hasLongPress = onLongPress != null;

    if (hasTap || hasLongPress) {
      return InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        borderRadius: BorderRadius.circular(AppBorderRadius.md),
        child: card,
      );
    }

    return card;
  }
}

/// A text field with consistent decoration and error handling.
///
/// Wraps TextFormField with the app's token values so every input looks the
/// same and behaves the same across light/dark themes.
class AppTextField extends StatelessWidget {
  const AppTextField({
    super.key,
    this.controller,
    this.label,
    this.hint,
    this.prefixIcon,
    this.suffixIcon,
    this.obscureText = false,
    this.keyboardType,
    this.textInputAction,
    this.validator,
    this.onChanged,
    this.onSubmitted,
    this.enabled = true,
    this.maxLines = 1,
    this.initialValue,
    this.autofocus = false,
    this.readOnly = false,
    this.onTap,
    this.textAlign,
  });

  final TextEditingController? controller;
  final String? label;
  final String? hint;
  final Widget? prefixIcon;
  final Widget? suffixIcon;
  final bool obscureText;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final String? Function(String?)? validator;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final bool enabled;
  final int maxLines;
  final String? initialValue;
  final bool autofocus;
  final bool readOnly;
  final VoidCallback? onTap;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return TextFormField(
      controller: controller,
      initialValue: controller == null ? initialValue : null,
      obscureText: obscureText,
      keyboardType: keyboardType,
      textInputAction: textInputAction,
      validator: validator,
      onChanged: onChanged,
      onFieldSubmitted: onSubmitted,
      enabled: enabled,
      maxLines: maxLines,
      autofocus: autofocus,
      readOnly: readOnly,
      onTap: onTap,
      textAlign: textAlign ?? TextAlign.start,
      style: theme.textTheme.bodyLarge,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: prefixIcon,
        suffixIcon: suffixIcon,
        filled: true,
        fillColor: enabled
            ? theme.colorScheme.surfaceContainerHighest
            : theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.5),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppBorderRadius.md),
          borderSide: BorderSide(
            color: theme.colorScheme.outlineVariant,
          ),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppBorderRadius.md),
          borderSide: BorderSide(
            color: theme.colorScheme.outlineVariant,
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppBorderRadius.md),
          borderSide: BorderSide(
            color: theme.colorScheme.primary,
            width: 2,
          ),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppBorderRadius.md),
          borderSide: BorderSide(
            color: theme.colorScheme.error,
            width: 1.5,
          ),
        ),
        disabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppBorderRadius.md),
          borderSide: BorderSide(
            color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5),
          ),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.md,
        ),
        labelStyle: theme.textTheme.bodyMedium?.copyWith(
          color: theme.colorScheme.onSurfaceVariant,
        ),
        hintStyle: theme.textTheme.bodyMedium?.copyWith(
          color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.6),
        ),
        errorStyle: theme.textTheme.bodySmall?.copyWith(
          color: theme.colorScheme.error,
        ),
        floatingLabelBehavior: FloatingLabelBehavior.auto,
      ),
    );
  }
}

/// A consistent divider with theme-aware colour.
class AppDivider extends StatelessWidget {
  const AppDivider({
    super.key,
    this.indent = 0,
    this.endIndent = 0,
    this.thickness = 1,
    this.color,
  });

  final double indent;
  final double endIndent;
  final double thickness;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Divider(
      indent: indent,
      endIndent: endIndent,
      thickness: thickness,
      color: color ?? theme.colorScheme.outlineVariant,
    );
  }
}