import {
  BadRequestException,
  ValidationPipe,
  type ValidationPipeOptions,
} from '@nestjs/common';
import { ValidationError } from 'class-validator';
import type { FieldErrors } from '../errors/app-error.js';

export const VALIDATION_FAILED_MESSAGE = 'Validation failed';

function flattenErrors(
  errors: ValidationError[],
  prefix = '',
  fieldErrors: FieldErrors = {},
): FieldErrors {
  for (const error of errors) {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    if (error.constraints) {
      fieldErrors[path] = Object.values(error.constraints);
    }
    if (error.children && error.children.length > 0) {
      flattenErrors(error.children, path, fieldErrors);
    }
  }
  return fieldErrors;
}

export function toFieldErrors(errors: ValidationError[]): FieldErrors {
  const fieldErrors = flattenErrors(errors);
  if (Object.keys(fieldErrors).length === 0 && errors.length > 0) {
    fieldErrors[errors[0].property] = [
      `property ${errors[0].property} should not exist`,
    ];
  }
  return fieldErrors;
}

function exceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({
    message: VALIDATION_FAILED_MESSAGE,
    field_errors: toFieldErrors(errors),
  });
}

export function buildValidationPipeOptions(): ValidationPipeOptions {
  return {
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
    exceptionFactory,
  };
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe(buildValidationPipeOptions());
}
