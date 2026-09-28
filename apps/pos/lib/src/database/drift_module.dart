import 'package:injectable/injectable.dart';

import 'app_database.dart';
import 'database_service.dart';

@module
abstract class DriftModule {
  @singleton
  AppDatabase appDatabase() {
    return AppDatabase();
  }

  @singleton
  DatabaseService databaseService(AppDatabase database) {
    return DatabaseService(database);
  }
}
