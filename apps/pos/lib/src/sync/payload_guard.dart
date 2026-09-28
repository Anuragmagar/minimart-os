import 'dart:convert';

/// Rejects payloads that would persist credentials into the local outbox.
///
/// `SyncOperations.payload` is an unencrypted JSON blob written to disk on a
/// shared, physically-accessible retail device. `brain/SECURITY.md` forbids
/// storing passwords and requires tokens to live in OS secure storage, so a
/// payload carrying a token would leak a live credential to anyone who can read
/// the file, and it would keep a credential alive after the user logged out.
///
/// The key list is the same deny-list the backend audit service already uses to
/// redact before/after data, so a payload that is safe to audit is safe to
/// queue. This is a deny-list, which is defence in depth and not a substitute
/// for the sync engine never putting credentials in a payload in the first
/// place.
class PayloadGuard {
  const PayloadGuard._();

  /// Keys that must never appear anywhere in a payload.
  ///
  /// Stored lower-case because lookups normalise the candidate key with
  /// [String.toLowerCase] before comparing. Writing the entries in camelCase
  /// here and comparing against a lower-cased key would silently never match.
  static const Set<String> forbiddenKeys = {
    'password',
    'passwordhash',
    'token',
    'accesstoken',
    'refreshtoken',
    'idtoken',
    'secret',
    'apikey',
    'cardnumber',
    'pannumber',
    'pin',
    'otp',
    'authorization',
    'cookie',
  };

  /// Throws [ArgumentError] if [jsonPayload] is not a JSON object, or contains
  /// a forbidden key at any depth.
  ///
  /// Rejecting rather than silently redacting is deliberate: silently dropping
  /// a key that a business command needs would produce a corrupt operation,
  /// while failing loudly keeps the caller honest.
  static void check(String jsonPayload) {
    final decoded = jsonDecode(jsonPayload);
    if (decoded is! Map<String, dynamic>) {
      throw ArgumentError(
        'Sync payload must be a JSON object, got ${decoded.runtimeType}',
      );
    }
    final offending = findForbiddenKeys(decoded);
    if (offending.isNotEmpty) {
      throw ArgumentError(
        'Sync payload contains credential keys: ${offending.join(', ')}',
      );
    }
  }

  /// Returns every forbidden key found, at any depth, dotted for context so
  /// the caller can see which branch of the operation leaked it.
  static List<String> findForbiddenKeys(Map<String, dynamic> value) {
    final found = <String>[];
    void walk(Map<String, dynamic> node, String prefix) {
      node.forEach((key, child) {
        final here = prefix.isEmpty ? key : '$prefix.$key';
        if (forbiddenKeys.contains(key.toLowerCase())) {
          found.add(here);
        }
        if (child is Map<String, dynamic>) {
          walk(child, here);
        } else if (child is List) {
          for (final element in child) {
            if (element is Map<String, dynamic>) {
              walk(element, here);
            }
          }
        }
      });
    }

    walk(value, '');
    return found;
  }
}
