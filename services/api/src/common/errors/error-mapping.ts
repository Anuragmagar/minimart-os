import { HttpException } from '@nestjs/common';
import { AppError, type FieldErrors } from '../errors/app-error.js';

export interface CanonicalError {
  code: string;
  message: string;
  details: Record<string, unknown>;
  fieldErrors: FieldErrors;
}

export const INTERNAL_ERROR_CODE = 'INTERNAL_SERVER_ERROR';
export const VALIDATION_ERROR_CODE = 'VALIDATION_FAILED';

const STATUS_TO_CODE: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  411: 'LENGTH_REQUIRED',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
};

export function statusToCode(status: number): string {
  return STATUS_TO_CODE[status] ?? INTERNAL_ERROR_CODE;
}

interface HttpErrorLike extends Error {
  statusCode?: unknown;
  status?: unknown;
  expose?: unknown;
}

export function isHttpErrorLike(error: unknown): error is HttpErrorLike {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as Partial<HttpErrorLike>;
  return (
    typeof candidate.statusCode === 'number' &&
    candidate.statusCode >= 400 &&
    candidate.statusCode < 600 &&
    (candidate.status === candidate.statusCode ||
      typeof candidate.expose === 'boolean')
  );
}

export function errorStatus(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }
  if (error instanceof HttpException) {
    return error.getStatus();
  }
  if (isHttpErrorLike(error)) {
    return error.statusCode as number;
  }
  return 500;
}

function extractMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string') {
      return response;
    }
    if (response && typeof response === 'object') {
      const body = response as Record<string, unknown>;
      if (typeof body.message === 'string') {
        return body.message;
      }
      if (Array.isArray(body.message)) {
        return body.message.map(String).join('; ');
      }
      if (typeof body.error === 'string') {
        return body.error;
      }
    }
    return 'Request failed';
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Internal Server Error';
}

function extractFieldErrors(error: unknown): FieldErrors {
  if (error instanceof AppError) {
    return error.fieldErrors;
  }
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (response && typeof response === 'object') {
      const body = response as Record<string, unknown>;
      if (body.field_errors && typeof body.field_errors === 'object') {
        return body.field_errors as FieldErrors;
      }
      if (Array.isArray(body.message)) {
        const fieldErrors: FieldErrors = {};
        for (const message of body.message) {
          const text =
            typeof message === 'string' ? message : JSON.stringify(message);
          fieldErrors[`item_${Object.keys(fieldErrors).length}`] = [text];
        }
        return fieldErrors;
      }
    }
  }
  return {};
}

function extractDetails(error: unknown): Record<string, unknown> {
  if (error instanceof AppError) {
    return error.details;
  }
  return {};
}

export function toCanonicalError(
  error: unknown,
  status: number,
): CanonicalError {
  const fieldErrors = extractFieldErrors(error);
  const code =
    error instanceof AppError
      ? error.code
      : (status === 400 || status === 422) &&
          Object.keys(fieldErrors).length > 0
        ? VALIDATION_ERROR_CODE
        : statusToCode(status);

  const isTrusted =
    error instanceof AppError ||
    error instanceof HttpException ||
    isHttpErrorLike(error);
  const message =
    status >= 500 && !isTrusted
      ? 'Internal Server Error'
      : extractMessage(error);

  return {
    code,
    message,
    details: extractDetails(error),
    fieldErrors,
  };
}
