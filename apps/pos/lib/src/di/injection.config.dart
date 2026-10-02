// GENERATED CODE - DO NOT MODIFY BY HAND
// dart format width=80

// **************************************************************************
// InjectableConfigGenerator
// **************************************************************************

// ignore_for_file: type=lint
// coverage:ignore-file

// ignore_for_file: no_leading_underscores_for_library_prefixes

import 'package:dio/dio.dart' as _i361;
import 'package:get_it/get_it.dart' as _i174;
import 'package:go_router/go_router.dart' as _i583;
import 'package:injectable/injectable.dart' as _i526;
import 'package:shared_preferences/shared_preferences.dart' as _i460;

import '../auth/auth_module.dart' as _i343;
import '../auth/auth_state.dart' as _i449;
import '../connectivity/connectivity_module.dart' as _i175;
import '../connectivity/connectivity_probe.dart' as _i713;
import '../connectivity/connectivity_service.dart' as _i528;
import '../data/catalog_local_data_source.dart' as _i1024;
import '../data/catalog_repository.dart' as _i1044;
import '../data/product_local_data_source.dart' as _i277;
import '../database/app_database.dart' as _i982;
import '../database/database_service.dart' as _i711;
import '../database/drift_module.dart' as _i74;
import '../network/api_client.dart' as _i557;
import '../network/network_module.dart' as _i200;
import '../router/router_module.dart' as _i948;
import '../theme/theme_module.dart' as _i1057;
import '../theme/theme_provider.dart' as _i416;

// initializes the registration of main-scope dependencies inside of GetIt
_i174.GetIt $initGetIt(
  _i174.GetIt getIt, {
  String? environment,
  _i526.EnvironmentFilter? environmentFilter,
}) {
  final gh = _i526.GetItHelper(getIt, environment, environmentFilter);
  final authModule = _$AuthModule();
  final driftModule = _$DriftModule();
  final networkModule = _$NetworkModule();
  final connectivityModule = _$ConnectivityModule();
  final routerModule = _$RouterModule();
  final themeModule = _$ThemeModule();
  gh.singleton<_i449.AuthState>(() => authModule.authState());
  gh.singleton<_i982.AppDatabase>(() => driftModule.appDatabase());
  gh.singleton<_i361.Dio>(() => networkModule.dio());
  gh.singleton<_i713.ConnectivityProbe>(
    () => connectivityModule.connectivityProbe(gh<_i361.Dio>()),
  );
  gh.lazySingleton<_i528.ConnectivityService>(
    () => connectivityModule.connectivityService(gh<_i713.ConnectivityProbe>()),
  );
  gh.singleton<_i1024.CatalogLocalDataSource>(
    () => _i1024.CatalogLocalDataSource(gh<_i982.AppDatabase>()),
  );
  gh.singleton<_i277.ProductLocalDataSource>(
    () => _i277.ProductLocalDataSource(gh<_i982.AppDatabase>()),
  );
  gh.singleton<_i583.GoRouter>(
    () => routerModule.appRouter(gh<_i449.AuthState>()),
  );
  gh.singleton<_i711.DatabaseService>(
    () => driftModule.databaseService(gh<_i982.AppDatabase>()),
  );
  gh.singleton<_i557.ApiClient>(
    () => networkModule.apiClient(gh<_i361.Dio>(), gh<_i449.AuthState>()),
  );
  gh.singletonAsync<_i416.ThemeProvider>(
    () => themeModule.themeProvider(gh<_i460.SharedPreferences>()),
  );
  gh.singleton<_i1044.ProductCatalogDataRepository>(
    () => _i1044.ProductCatalogDataRepository(
      gh<_i277.ProductLocalDataSource>(),
      gh<_i1024.CatalogLocalDataSource>(),
    ),
  );
  return getIt;
}

class _$AuthModule extends _i343.AuthModule {}

class _$DriftModule extends _i74.DriftModule {}

class _$NetworkModule extends _i200.NetworkModule {}

class _$ConnectivityModule extends _i175.ConnectivityModule {}

class _$RouterModule extends _i948.RouterModule {}

class _$ThemeModule extends _i1057.ThemeModule {}
