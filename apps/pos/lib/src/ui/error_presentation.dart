import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import '../network/exceptions.dart';

/// Extension on BuildContext for showing error presentations
extension ErrorPresentation on BuildContext {
  /// Shows a snackbar with the error message
  void showErrorSnackBar(AppException error, {Duration? duration}) {
    ScaffoldMessenger.of(this).showSnackBar(
      SnackBar(
        content: Text(_getUserFriendlyMessage(error)),
        backgroundColor: Theme.of(this).colorScheme.errorContainer,
        behavior: SnackBarBehavior.floating,
        duration: duration ?? const Duration(seconds: 4),
        action: error is NetworkException
            ? SnackBarAction(
                label: 'Retry',
                textColor: Theme.of(this).colorScheme.onErrorContainer,
                onPressed: () => _handleRetry(error),
              )
            : null,
      ),
    );
  }

  /// Shows an error dialog with details
  Future<void> showErrorDialog(AppException error) async {
    return showDialog<void>(
      context: this,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            Icon(
              Icons.error_outline,
              color: Theme.of(context).colorScheme.error,
            ),
            const SizedBox(width: 12),
            Expanded(child: Text(_getErrorTitle(error))),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(_getUserFriendlyMessage(error)),
            if (error.details != null && error.details!.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                'Details: ${error.details.toString()}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
            if (error.fieldErrors != null && error.fieldErrors!.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(
                'Validation Errors:',
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: Theme.of(context).colorScheme.error,
                ),
              ),
              ...error.fieldErrors!.entries.map(
                (e) => Padding(
                  padding: const EdgeInsets.only(top: 4, left: 8),
                  child: Text(
                    '${e.key}: ${e.value.join(', ')}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
              ),
            ],
            if (error.requestId != null) ...[
              const SizedBox(height: 12),
              Text(
                'Request ID: ${error.requestId}',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ],
        ),
        actions: [
          if (error is NetworkException)
            TextButton(
              onPressed: () {
                Navigator.of(context).pop();
                _handleRetry(error);
              },
              child: const Text('Retry'),
            ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Dismiss'),
          ),
        ],
      ),
    );
  }

  /// Shows an inline error banner (for forms, etc.)
  Widget buildErrorBanner(AppException error, {VoidCallback? onDismiss}) {
    return MaterialBanner(
      content: Text(_getUserFriendlyMessage(error)),
      leading: Icon(
        Icons.error_outline,
        color: Theme.of(this).colorScheme.onErrorContainer,
      ),
      backgroundColor: Theme.of(this).colorScheme.errorContainer,
      actions: [
        if (error is NetworkException)
          TextButton(
            onPressed: () => _handleRetry(error),
            child: const Text('Retry'),
          ),
        if (onDismiss != null)
          TextButton(onPressed: onDismiss, child: const Text('Dismiss')),
      ],
    );
  }

  String _getErrorTitle(AppException error) {
    switch (error.runtimeType) {
      case NetworkException _:
        return 'Connection Error';
      case AuthException _:
        return 'Authentication Required';
      case ValidationException _:
        return 'Validation Error';
      default:
        return 'Error';
    }
  }

  String _getUserFriendlyMessage(AppException error) {
    // Map technical error codes to user-friendly messages
    switch (error.code) {
      case 'NETWORK_ERROR':
        return 'Unable to connect to the server. Please check your internet connection.';
      case 'CONNECTION_ERROR':
        return 'Network connection failed. Please check your internet connection.';
      case 'TIMEOUT':
        return 'The request timed out. Please try again.';
      case 'HTTP_401':
      case 'AUTH_ERROR':
        return 'Your session has expired. Please sign in again.';
      case 'HTTP_403':
        return 'You do not have permission to perform this action.';
      case 'HTTP_404':
        return 'The requested resource was not found.';
      case 'HTTP_409':
        return 'A conflict occurred. Please refresh and try again.';
      case 'VALIDATION_FAILED':
        return 'Please check the entered information and try again.';
      case 'PAYLOAD_TOO_LARGE':
        return 'The request is too large. Please reduce the data and try again.';
      case 'UNSUPPORTED_MEDIA_TYPE':
        return 'Invalid data format. Please check your input.';
      case 'TOO_MANY_REQUESTS':
        return 'Too many requests. Please wait a moment and try again.';
      case 'INTERNAL_SERVER_ERROR':
      case 'UNKNOWN_ERROR':
      default:
        return error.message.isNotEmpty
            ? error.message
            : 'An unexpected error occurred. Please try again.';
    }
  }

  void _handleRetry(NetworkException error) {
    // This would typically trigger a retry of the failed operation
    // For now, we just dismiss the snackbar
    ScaffoldMessenger.of(this).hideCurrentSnackBar();
  }
}

/// Global error handler for uncaught errors
class ErrorHandler {
  static void handleError(
    BuildContext context,
    Object error,
    StackTrace stackTrace,
  ) {
    if (error is AppException) {
      context.showErrorSnackBar(error);
    } else if (error is DioException) {
      context.showErrorSnackBar(NetworkException.fromDioError(error));
    } else {
      // Log the error for debugging
      debugPrint('Unhandled error: $error\n$stackTrace');
      context.showErrorSnackBar(
        const AppException(
          code: 'UNKNOWN_ERROR',
          message: 'An unexpected error occurred. Please try again.',
        ),
      );
    }
  }
}
