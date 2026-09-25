import 'package:flutter_test/flutter_test.dart';
import 'package:get_it/get_it.dart';
import 'package:go_router/go_router.dart';
import 'package:pos/src/di/injection.dart';

void main() {
  setUp(() => GetIt.instance.reset());
  tearDown(() => GetIt.instance.reset());

  test('DI container registers GoRouter as singleton', () {
    configureDependencies();

    final first = getIt<GoRouter>();
    final second = getIt<GoRouter>();

    expect(first, isA<GoRouter>());
    expect(identical(first, second), isTrue);
  });
}
