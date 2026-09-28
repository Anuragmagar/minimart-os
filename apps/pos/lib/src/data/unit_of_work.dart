import 'package:pos/src/database/app_database.dart';

/// Runs a group of local writes inside a single database transaction.
///
/// `AGENTS.md` §21 requires that multi-entity business operations are atomic,
/// including sale completion, goods receipt, returns, stock adjustments, stock
/// transfers, customer/supplier payments, and cash closing. Any repository
/// method that writes more than one table must run through this class so a
/// partial write cannot survive a failure.
///
/// Reads do not need this class.
class UnitOfWork {
  final AppDatabase _database;

  const UnitOfWork(this._database);

  AppDatabase get database => _database;

  /// Executes [action] atomically. Rolls back on any error.
  Future<T> run<T>(Future<T> Function() action) =>
      _database.transaction(action);
}
