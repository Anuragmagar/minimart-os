import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:pos/src/connectivity/connectivity_probe.dart';
import 'package:pos/src/connectivity/connectivity_service.dart';
import 'package:pos/src/connectivity/connectivity_status.dart';

/// Scriptable probe so state-service behaviour can be tested without sockets.
class _FakeProbe implements ConnectivityProbe {
  bool reachable;
  int callCount = 0;
  Duration delay;

  _FakeProbe({this.reachable = true, this.delay = Duration.zero});

  @override
  Future<bool> isReachable() async {
    callCount++;
    if (delay > Duration.zero) await Future<void>.delayed(delay);
    return reachable;
  }
}

void main() {
  group('ConnectivityStatus', () {
    test('only online allows a sync attempt', () {
      expect(ConnectivityStatus.online.canSync, isTrue);
      expect(ConnectivityStatus.offline.canSync, isFalse);
    });

    test('unknown fails safe by refusing a sync attempt', () {
      expect(ConnectivityStatus.unknown.canSync, isFalse);
    });
  });

  group('ConnectivityService initial state', () {
    test('starts unknown, claiming neither reachability nor outage', () {
      final service = ConnectivityService(probe: _FakeProbe());
      expect(service.status, ConnectivityStatus.unknown);
      expect(service.hasResult, isFalse);
    });

    test('does not probe until asked', () async {
      final probe = _FakeProbe();
      final service = ConnectivityService(probe: probe);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(probe.callCount, 0);
      await service.dispose();
    });
  });

  group('ConnectivityService probing', () {
    test('reports online when the server accepts a connection', () async {
      final service = ConnectivityService(probe: _FakeProbe(reachable: true));
      expect(await service.checkNow(), ConnectivityStatus.online);
      expect(service.hasResult, isTrue);
      await service.dispose();
    });

    test('reports offline when the server is unreachable', () async {
      final service = ConnectivityService(probe: _FakeProbe(reachable: false));
      expect(await service.checkNow(), ConnectivityStatus.offline);
      await service.dispose();
    });

    test('coalesces concurrent probes into one socket attempt', () async {
      final probe = _FakeProbe(delay: const Duration(milliseconds: 40));
      final service = ConnectivityService(probe: probe);

      await Future.wait([
        service.checkNow(),
        service.checkNow(),
        service.checkNow(),
      ]);

      expect(probe.callCount, 1);
      await service.dispose();
    });
  });

  group('ConnectivityService change notification', () {
    test('seeds a new listener with the current state', () async {
      final service = ConnectivityService(probe: _FakeProbe());
      await service.checkNow();

      final first = await service.changes.first;

      expect(first, ConnectivityStatus.online);
      await service.dispose();
    });

    test('emits only on a genuine change, not on every probe', () async {
      final probe = _FakeProbe();
      final service = ConnectivityService(probe: probe);

      final seen = <ConnectivityStatus>[];
      final sub = service.changes.listen(seen.add);

      await service.checkNow();
      await service.checkNow();
      await service.checkNow();
      await Future<void>.delayed(const Duration(milliseconds: 10));

      // Seeded unknown, then a single online transition.
      expect(seen, [ConnectivityStatus.unknown, ConnectivityStatus.online]);
      expect(probe.callCount, 3);

      await sub.cancel();
      await service.dispose();
    });

    test('a transition occurring right after subscribe is not dropped', () async {
      // Regression: the previous implementation used an `async*` generator
      // that suspended at the seed `yield` before subscribing to the underlying
      // broadcast controller. Broadcast streams do not replay, so a transition
      // in that window was lost forever and the listener never learned the
      // state had changed.
      final probe = _FakeProbe();
      final service = ConnectivityService(probe: probe);

      final seen = <ConnectivityStatus>[];
      final sub = service.changes.listen(seen.add);

      await service.checkNow();
      await Future<void>.delayed(const Duration(milliseconds: 10));

      expect(seen, contains(ConnectivityStatus.online));

      await sub.cancel();
      await service.dispose();
    });

    test('reports a full offline-to-online flap', () async {
      final probe = _FakeProbe(reachable: false);
      final service = ConnectivityService(probe: probe);

      final seen = <ConnectivityStatus>[];
      final sub = service.changes.listen(seen.add);

      await service.checkNow();
      probe.reachable = true;
      await service.checkNow();
      probe.reachable = false;
      await service.checkNow();
      await Future<void>.delayed(const Duration(milliseconds: 10));

      expect(seen, [
        ConnectivityStatus.unknown,
        ConnectivityStatus.offline,
        ConnectivityStatus.online,
        ConnectivityStatus.offline,
      ]);

      await sub.cancel();
      await service.dispose();
    });
  });

  group('ConnectivityService lifecycle', () {
    test('start probes immediately and sets isRunning', () async {
      final probe = _FakeProbe();
      final service = ConnectivityService(
        probe: probe,
        pollInterval: const Duration(milliseconds: 20),
      );

      service.start();
      await Future<void>.delayed(const Duration(milliseconds: 10));

      expect(service.isRunning, isTrue);
      expect(probe.callCount, 1);

      await service.dispose();
    });

    test('start is idempotent', () async {
      final probe = _FakeProbe();
      final service = ConnectivityService(probe: probe);

      service.start();
      service.start();
      service.start();
      await Future<void>.delayed(const Duration(milliseconds: 10));

      expect(probe.callCount, 1);

      await service.dispose();
    });

    test('polling continues while running', () async {
      final probe = _FakeProbe();
      final service = ConnectivityService(
        probe: probe,
        pollInterval: const Duration(milliseconds: 20),
      );

      service.start();
      await Future<void>.delayed(const Duration(milliseconds: 70));

      expect(probe.callCount, greaterThan(1));

      await service.dispose();
    });

    test('stop halts polling but keeps the last status', () async {
      final probe = _FakeProbe();
      final service = ConnectivityService(
        probe: probe,
        pollInterval: const Duration(milliseconds: 20),
      );

      service.start();
      await Future<void>.delayed(const Duration(milliseconds: 10));
      final statusAtStop = service.status;
      service.stop();

      final countAtStop = probe.callCount;
      await Future<void>.delayed(const Duration(milliseconds: 60));

      expect(probe.callCount, countAtStop);
      expect(service.status, statusAtStop);
      expect(service.isRunning, isFalse);

      await service.dispose();
    });

    test('backs off longer while offline than while online', () async {
      final probe = _FakeProbe(reachable: false);
      final service = ConnectivityService(
        probe: probe,
        pollInterval: const Duration(milliseconds: 20),
      );

      service.start();
      await Future<void>.delayed(const Duration(milliseconds: 60));
      final offlineCount = probe.callCount;

      // The online cadence alone would have produced roughly three probes in
      // 60ms. Offline adds a 15s backoff, so effectively none should occur.
      expect(offlineCount, 1);

      await service.dispose();
    });

    test('dispose stops polling and rejects further use', () async {
      final probe = _FakeProbe();
      final service = ConnectivityService(
        probe: probe,
        pollInterval: const Duration(milliseconds: 20),
      );

      service.start();
      await Future<void>.delayed(const Duration(milliseconds: 10));
      await service.dispose();

      final countAfterDispose = probe.callCount;
      await Future<void>.delayed(const Duration(milliseconds: 60));
      expect(probe.callCount, countAfterDispose);

      expect(() => service.checkNow(), throwsStateError);
      expect(service.start, throwsStateError);
    });

    test('changes stream closes on dispose', () async {
      final service = ConnectivityService(probe: _FakeProbe());
      var closed = false;
      service.changes.listen(null, onDone: () => closed = true);

      await service.dispose();
      await Future<void>.delayed(const Duration(milliseconds: 10));

      expect(closed, isTrue);
    });
  });

  group('SocketConnectivityProbe against a real loopback socket', () {
    late ServerSocket server;

    setUp(() async {
      // Loopback only: no external network is used by the suite.
      server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    });

    tearDown(() async => server.close());

    test('reports reachable when a listener accepts', () async {
      final probe = SocketConnectivityProbe(
        host: InternetAddress.loopbackIPv4.address,
        port: server.port,
        timeout: const Duration(seconds: 2),
      );
      expect(await probe.isReachable(), isTrue);
    });

    test('reports unreachable when nothing is listening', () async {
      final port = server.port;
      await server.close();
      // Rebind so tearDown has a live handle, then probe the freed port.
      server = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);

      final probe = SocketConnectivityProbe(
        host: InternetAddress.loopbackIPv4.address,
        port: port,
        timeout: const Duration(seconds: 2),
      );
      expect(await probe.isReachable(), isFalse);
    });

    test(
      'returns false rather than throwing on an unresolvable host',
      () async {
        final probe = SocketConnectivityProbe(
          host: 'no-such-host.invalid',
          port: 9,
          timeout: const Duration(seconds: 2),
        );
        expect(await probe.isReachable(), isFalse);
      },
    );
  });
}
