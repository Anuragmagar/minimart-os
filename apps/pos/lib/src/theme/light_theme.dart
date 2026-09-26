import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';

import 'app_theme_tokens.dart';

ThemeData createLightTheme() {
  const primary = AppColors.primary;
  const onPrimary = AppColors.onPrimary;
  const primaryContainer = AppColors.primaryContainer;
  const onPrimaryContainer = AppColors.onPrimaryContainer;

  const secondary = AppColors.secondary;
  const onSecondary = AppColors.onSecondary;
  const secondaryContainer = AppColors.secondaryContainer;
  const onSecondaryContainer = AppColors.onSecondaryContainer;

  const tertiary = AppColors.tertiary;
  const onTertiary = AppColors.onTertiary;
  const tertiaryContainer = AppColors.tertiaryContainer;
  const onTertiaryContainer = AppColors.onTertiaryContainer;

  const surface = AppColors.surface;
  const onSurface = AppColors.onSurface;
  const onSurfaceVariant = AppColors.onSurfaceVariant;
  const outline = AppColors.outline;
  const outlineVariant = AppColors.outlineVariant;

  const error = AppColors.error;
  const onError = AppColors.onError;
  const errorContainer = AppColors.errorContainer;
  const onErrorContainer = AppColors.onErrorContainer;

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: const ColorScheme(
      brightness: Brightness.light,
      primary: primary,
      onPrimary: onPrimary,
      primaryContainer: primaryContainer,
      onPrimaryContainer: onPrimaryContainer,
      secondary: secondary,
      onSecondary: onSecondary,
      secondaryContainer: secondaryContainer,
      onSecondaryContainer: onSecondaryContainer,
      tertiary: tertiary,
      onTertiary: onTertiary,
      tertiaryContainer: tertiaryContainer,
      onTertiaryContainer: onTertiaryContainer,
      error: error,
      onError: onError,
      errorContainer: errorContainer,
      onErrorContainer: onErrorContainer,
      surface: AppColors.surface,
      onSurface: onSurface,
      surfaceContainerHighest: AppColors.surfaceContainerHighest,
      onSurfaceVariant: onSurfaceVariant,
      outline: outline,
      outlineVariant: outlineVariant,
      shadow: AppColors.shadow,
      inverseSurface: AppColors.inverseSurface,
      onInverseSurface: AppColors.inverseOnSurface,
      inversePrimary: AppColors.inversePrimary,
      surfaceTint: primary,
    ),
    scaffoldBackgroundColor: AppColors.surface,
    textTheme: const TextTheme(
      displayLarge: AppTypography.displayLarge,
      displayMedium: AppTypography.displayMedium,
      displaySmall: AppTypography.displaySmall,
      headlineLarge: AppTypography.headlineLarge,
      headlineMedium: AppTypography.headlineMedium,
      headlineSmall: AppTypography.headlineSmall,
      titleLarge: AppTypography.titleLarge,
      titleMedium: AppTypography.titleMedium,
      titleSmall: AppTypography.titleSmall,
      bodyLarge: AppTypography.bodyLarge,
      bodyMedium: AppTypography.bodyMedium,
      bodySmall: AppTypography.bodySmall,
      labelLarge: AppTypography.labelLarge,
      labelMedium: AppTypography.labelMedium,
      labelSmall: AppTypography.labelSmall,
    ),
    appBarTheme: AppBarTheme(
      centerTitle: false,
      elevation: AppElevation.level0,
      scrolledUnderElevation: AppElevation.level1,
      backgroundColor: AppColors.surface,
      foregroundColor: onSurface,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: AppTypography.titleLarge.copyWith(color: onSurface),
    ),
    cardTheme: CardThemeData(
      elevation: AppElevation.level1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.lg),
      ),
      margin: EdgeInsets.zero,
      color: AppColors.surfaceContainer,
      surfaceTintColor: Colors.transparent,
      shadowColor: AppColors.shadow,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        elevation: AppElevation.level1,
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.md,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppBorderRadius.md),
        ),
        textStyle: AppTypography.labelLarge,
        minimumSize: const Size(88, 48),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.md,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppBorderRadius.md),
        ),
        textStyle: AppTypography.labelLarge,
        minimumSize: const Size(88, 48),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.md,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppBorderRadius.md),
        ),
        textStyle: AppTypography.labelLarge,
        minimumSize: const Size(88, 48),
        side: BorderSide(color: AppColors.outline),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.sm,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppBorderRadius.md),
        ),
        textStyle: AppTypography.labelLarge,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surfaceContainer,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.md,
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.md),
        borderSide: BorderSide(color: AppColors.outline),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.md),
        borderSide: BorderSide(color: AppColors.outline),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.md),
        borderSide: BorderSide(color: primary, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.md),
        borderSide: BorderSide(color: error),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.md),
        borderSide: BorderSide(color: error, width: 2),
      ),
      labelStyle: AppTypography.bodyMedium.copyWith(color: onSurfaceVariant),
      hintStyle: AppTypography.bodyMedium.copyWith(
        color: onSurfaceVariant.withValues(alpha: 0.6),
      ),
      floatingLabelStyle: AppTypography.bodySmall.copyWith(color: primary),
      errorStyle: AppTypography.bodySmall.copyWith(color: error),
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: AppColors.surfaceContainer,
      indicatorColor: primaryContainer,
      selectedIconTheme: IconThemeData(color: onPrimaryContainer, size: 24),
      unselectedIconTheme: IconThemeData(color: onSurfaceVariant, size: 24),
      selectedLabelTextStyle: AppTypography.labelSmall.copyWith(
        color: onPrimaryContainer,
        fontWeight: FontWeight.w600,
      ),
      unselectedLabelTextStyle: AppTypography.labelSmall.copyWith(
        color: onSurfaceVariant,
      ),
      minExtendedWidth: 200,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.surfaceContainer,
      indicatorColor: primaryContainer,
      labelTextStyle: WidgetStateProperty.resolveWith<TextStyle>(
        (states) {
          if (states.contains(WidgetState.selected)) {
            return AppTypography.labelSmall.copyWith(
              color: onPrimaryContainer,
              fontWeight: FontWeight.w600,
            );
          }
          return AppTypography.labelSmall.copyWith(color: onSurfaceVariant);
        },
      ),
      iconTheme: WidgetStateProperty.resolveWith<IconThemeData>(
        (states) {
          if (states.contains(WidgetState.selected)) {
            return IconThemeData(color: onPrimaryContainer, size: 24);
          }
          return IconThemeData(color: onSurfaceVariant, size: 24);
        },
      ),
      height: 72,
    ),
    tabBarTheme: TabBarThemeData(
      labelColor: primary,
      unselectedLabelColor: onSurfaceVariant,
      indicatorColor: primary,
      indicatorSize: TabBarIndicatorSize.label,
      labelStyle: AppTypography.labelLarge,
      unselectedLabelStyle: AppTypography.labelLarge,
      dividerColor: Colors.transparent,
    ),
    chipTheme: ChipThemeData(
      backgroundColor: AppColors.surfaceVariant,
      selectedColor: primaryContainer,
      disabledColor: AppColors.surfaceVariant.withValues(alpha: 0.5),
      labelStyle: AppTypography.labelMedium,
      secondaryLabelStyle: AppTypography.labelMedium.copyWith(
        color: onPrimaryContainer,
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.xs,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.full),
      ),
      side: BorderSide(color: AppColors.outlineVariant),
    ),
    dividerTheme: DividerThemeData(
      color: AppColors.outlineVariant,
      thickness: 1,
      space: 1,
    ),
    listTileTheme: ListTileThemeData(
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.xs,
      ),
      titleTextStyle: AppTypography.bodyLarge.copyWith(color: onSurface),
      subtitleTextStyle: AppTypography.bodyMedium.copyWith(color: onSurfaceVariant),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.md),
      ),
      tileColor: Colors.transparent,
      selectedTileColor: primaryContainer.withValues(alpha: 0.5),
      selectedColor: primary,
    ),
    floatingActionButtonTheme: FloatingActionButtonThemeData(
      elevation: AppElevation.level3,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.full),
      ),
    ),
    dialogTheme: DialogThemeData(
      elevation: AppElevation.level4,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.xl),
      ),
      backgroundColor: AppColors.surface,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: AppTypography.headlineSmall.copyWith(color: onSurface),
      contentTextStyle: AppTypography.bodyMedium.copyWith(color: onSurface),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      elevation: AppElevation.level4,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppBorderRadius.xl),
        ),
      ),
      backgroundColor: AppColors.surface,
      surfaceTintColor: Colors.transparent,
      modalBackgroundColor: AppColors.surface,
      modalBarrierColor: AppColors.shadow,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.md),
      ),
      backgroundColor: onSurface,
      contentTextStyle: AppTypography.bodyMedium.copyWith(color: surface),
      actionTextColor: primary,
      elevation: AppElevation.level3,
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: onSurface.withValues(alpha: 0.9),
        borderRadius: BorderRadius.circular(AppBorderRadius.sm),
      ),
      textStyle: AppTypography.bodySmall.copyWith(color: surface),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm,
      ),
    ),
    menuTheme: MenuThemeData(
      style: MenuStyle(
        backgroundColor: WidgetStatePropertyAll(AppColors.surfaceContainer),
        surfaceTintColor: WidgetStatePropertyAll(Colors.transparent),
        elevation: WidgetStatePropertyAll(AppElevation.level3),
        shape: WidgetStatePropertyAll(
          RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppBorderRadius.md),
          ),
        ),
      ),
    ),
    drawerTheme: DrawerThemeData(
      elevation: AppElevation.level4,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.zero,
      ),
      backgroundColor: AppColors.surface,
      surfaceTintColor: Colors.transparent,
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: primary,
      linearTrackColor: primaryContainer,
      circularTrackColor: primaryContainer,
    ),
    sliderTheme: SliderThemeData(
      activeTrackColor: primary,
      inactiveTrackColor: primaryContainer,
      thumbColor: primary,
      overlayColor: primary.withValues(alpha: 0.12),
      valueIndicatorColor: primary,
      valueIndicatorTextStyle: AppTypography.labelSmall.copyWith(color: onPrimary),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) return primary;
        return Colors.transparent;
      }),
      checkColor: WidgetStatePropertyAll(onPrimary),
      side: BorderSide(color: AppColors.outline, width: 2),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppBorderRadius.sm)),
    ),
    radioTheme: RadioThemeData(
      fillColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) return primary;
        return AppColors.outline;
      }),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) return primary;
        return AppColors.outline;
      }),
      trackColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) return primaryContainer;
        return AppColors.outlineVariant;
      }),
    ),
    iconTheme: IconThemeData(
      color: onSurface,
      size: 24,
    ),
    primaryIconTheme: IconThemeData(
      color: onPrimary,
      size: 24,
    ),
    splashFactory: InkRipple.splashFactory,
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.windows: FadeUpwardsPageTransitionsBuilder(),
      TargetPlatform.linux: FadeUpwardsPageTransitionsBuilder(),
      TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
    }),
  );
}