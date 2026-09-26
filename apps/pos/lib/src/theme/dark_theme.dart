import 'package:flutter/material.dart';
import 'package:flutter/cupertino.dart';

import 'app_theme_tokens.dart';

ThemeData createDarkTheme() {
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

  const onSurface = AppColors.onSurfaceDark;
  const onSurfaceVariant = AppColors.onSurfaceVariantDark;
  const outline = AppColors.outlineDark;
  const outlineVariant = AppColors.outlineVariantDark;

  const error = AppColors.error;
  const onError = AppColors.onError;
  const errorContainer = AppColors.errorContainer;
  const onErrorContainer = AppColors.onErrorContainer;

  return ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: const ColorScheme(
      brightness: Brightness.dark,
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
      surface: AppColors.surfaceDark,
      onSurface: onSurface,
      surfaceContainerHighest: AppColors.surfaceContainerHighestDark,
      onSurfaceVariant: onSurfaceVariant,
      outline: outline,
      outlineVariant: outlineVariant,
      shadow: AppColors.shadowDark,
      inverseSurface: AppColors.inverseSurface,
      onInverseSurface: AppColors.inverseOnSurface,
      inversePrimary: AppColors.inversePrimary,
      surfaceTint: primary,
    ),
    scaffoldBackgroundColor: AppColors.surfaceDark,
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
      backgroundColor: AppColors.surfaceDark,
      foregroundColor: AppColors.onSurfaceDark,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: AppTypography.titleLarge.copyWith(color: AppColors.onSurfaceDark),
    ),
    cardTheme: CardThemeData(
      elevation: AppElevation.level1,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.lg),
      ),
      margin: EdgeInsets.zero,
      color: AppColors.surfaceContainerDark,
      surfaceTintColor: Colors.transparent,
      shadowColor: AppColors.shadowDark,
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
        side: BorderSide(color: AppColors.outlineDark),
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
      fillColor: AppColors.surfaceContainerDark,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.md,
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.md),
        borderSide: BorderSide(color: AppColors.outlineDark),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.md),
        borderSide: BorderSide(color: AppColors.outlineDark),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.md),
        borderSide: BorderSide(color: AppColors.primary, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.md),
        borderSide: BorderSide(color: AppColors.error),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.md),
        borderSide: BorderSide(color: AppColors.error, width: 2),
      ),
      labelStyle: AppTypography.bodyMedium.copyWith(color: AppColors.onSurfaceVariantDark),
      hintStyle: AppTypography.bodyMedium.copyWith(
        color: AppColors.onSurfaceVariantDark.withValues(alpha: 0.6),
      ),
      floatingLabelStyle: AppTypography.bodySmall.copyWith(color: AppColors.primary),
      errorStyle: AppTypography.bodySmall.copyWith(color: AppColors.error),
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: AppColors.surfaceContainerDark,
      indicatorColor: AppColors.primaryContainer,
      selectedIconTheme: IconThemeData(color: AppColors.onPrimaryContainer, size: 24),
      unselectedIconTheme: IconThemeData(color: AppColors.onSurfaceVariantDark, size: 24),
      selectedLabelTextStyle: AppTypography.labelSmall.copyWith(
        color: AppColors.onPrimaryContainer,
        fontWeight: FontWeight.w600,
      ),
      unselectedLabelTextStyle: AppTypography.labelSmall.copyWith(
        color: AppColors.onSurfaceVariantDark,
      ),
      minExtendedWidth: 200,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.surfaceContainerDark,
      indicatorColor: AppColors.primaryContainer,
      labelTextStyle: WidgetStateProperty.resolveWith<TextStyle>(
        (states) {
          if (states.contains(WidgetState.selected)) {
            return AppTypography.labelSmall.copyWith(
              color: AppColors.onPrimaryContainer,
              fontWeight: FontWeight.w600,
            );
          }
          return AppTypography.labelSmall.copyWith(color: AppColors.onSurfaceVariantDark);
        },
      ),
      iconTheme: WidgetStateProperty.resolveWith<IconThemeData>(
        (states) {
          if (states.contains(WidgetState.selected)) {
            return IconThemeData(color: AppColors.onPrimaryContainer, size: 24);
          }
          return IconThemeData(color: AppColors.onSurfaceVariantDark, size: 24);
        },
      ),
      height: 72,
    ),
    tabBarTheme: TabBarThemeData(
      labelColor: AppColors.primary,
      unselectedLabelColor: AppColors.onSurfaceVariantDark,
      indicatorColor: AppColors.primary,
      indicatorSize: TabBarIndicatorSize.label,
      labelStyle: AppTypography.labelLarge,
      unselectedLabelStyle: AppTypography.labelLarge,
      dividerColor: Colors.transparent,
    ),
    chipTheme: ChipThemeData(
      backgroundColor: AppColors.surfaceVariantDark,
      selectedColor: AppColors.primaryContainer,
      disabledColor: AppColors.surfaceVariantDark.withValues(alpha: 0.5),
      labelStyle: AppTypography.labelMedium,
      secondaryLabelStyle: AppTypography.labelMedium.copyWith(
        color: AppColors.onPrimaryContainer,
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.xs,
      ),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.full),
      ),
      side: BorderSide(color: AppColors.outlineVariantDark),
    ),
    dividerTheme: DividerThemeData(
      color: AppColors.outlineVariantDark,
      thickness: 1,
      space: 1,
    ),
    listTileTheme: ListTileThemeData(
      contentPadding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.xs,
      ),
      titleTextStyle: AppTypography.bodyLarge.copyWith(color: AppColors.onSurfaceDark),
      subtitleTextStyle: AppTypography.bodyMedium.copyWith(color: AppColors.onSurfaceVariantDark),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.md),
      ),
      tileColor: Colors.transparent,
      selectedTileColor: AppColors.primaryContainer.withValues(alpha: 0.5),
      selectedColor: AppColors.primary,
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
      backgroundColor: AppColors.surfaceDark,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: AppTypography.headlineSmall.copyWith(color: AppColors.onSurfaceDark),
      contentTextStyle: AppTypography.bodyMedium.copyWith(color: AppColors.onSurfaceDark),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      elevation: AppElevation.level4,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppBorderRadius.xl),
        ),
      ),
      backgroundColor: AppColors.surfaceDark,
      surfaceTintColor: Colors.transparent,
      modalBackgroundColor: AppColors.surfaceDark,
      modalBarrierColor: AppColors.shadowDark,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppBorderRadius.md),
      ),
      backgroundColor: AppColors.onSurfaceDark,
      contentTextStyle: AppTypography.bodyMedium.copyWith(color: AppColors.surfaceDark),
      actionTextColor: AppColors.primary,
      elevation: AppElevation.level3,
    ),
    tooltipTheme: TooltipThemeData(
      decoration: BoxDecoration(
        color: AppColors.onSurfaceDark.withValues(alpha: 0.9),
        borderRadius: BorderRadius.circular(AppBorderRadius.sm),
      ),
      textStyle: AppTypography.bodySmall.copyWith(color: AppColors.surfaceDark),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm,
      ),
    ),
    menuTheme: MenuThemeData(
      style: MenuStyle(
        backgroundColor: WidgetStatePropertyAll(AppColors.surfaceContainerDark),
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
      backgroundColor: AppColors.surfaceDark,
      surfaceTintColor: Colors.transparent,
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: AppColors.primary,
      linearTrackColor: AppColors.primaryContainer,
      circularTrackColor: AppColors.primaryContainer,
    ),
    sliderTheme: SliderThemeData(
      activeTrackColor: AppColors.primary,
      inactiveTrackColor: AppColors.primaryContainer,
      thumbColor: AppColors.primary,
      overlayColor: AppColors.primary.withValues(alpha: 0.12),
      valueIndicatorColor: AppColors.primary,
      valueIndicatorTextStyle: AppTypography.labelSmall.copyWith(color: AppColors.onPrimary),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) return AppColors.primary;
        return Colors.transparent;
      }),
      checkColor: WidgetStatePropertyAll(AppColors.onPrimary),
      side: BorderSide(color: AppColors.outlineDark, width: 2),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppBorderRadius.sm)),
    ),
    radioTheme: RadioThemeData(
      fillColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) return AppColors.primary;
        return AppColors.outlineDark;
      }),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) return AppColors.primary;
        return AppColors.outlineDark;
      }),
      trackColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) return AppColors.primaryContainer;
        return AppColors.outlineVariantDark;
      }),
    ),
    iconTheme: IconThemeData(
      color: AppColors.onSurfaceDark,
      size: 24,
    ),
    primaryIconTheme: IconThemeData(
      color: AppColors.onPrimary,
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