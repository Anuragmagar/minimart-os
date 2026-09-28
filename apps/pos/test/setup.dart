import 'package:drift/drift.dart';
import 'package:flutter_test/flutter_test.dart';

/// Each test builds its own in-memory [AppDatabase], so Drift sees several
/// `AppDatabase` instances in one isolate and warns about concurrent
/// executors. These are intentionally isolated per test, which is the
/// documented way to test Drift, so the warning is suppressed here rather than
/// by weakening production behaviour.
void configureTestDrift() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(configureTestDrift);
}
