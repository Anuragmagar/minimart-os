import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AppError } from './app-error.js';
import { toCanonicalError } from './error-mapping.js';

describe('AppError', () => {
  it('defaults statusCode to 500 and empty details/fieldErrors', () => {
    const error = new AppError({ code: 'TEST', message: 'boom' });
    expect(error.statusCode).toBe(500);
    expect(error.details).toEqual({});
    expect(error.fieldErrors).toEqual({});
    expect(error.name).toBe('AppError');
  });

  it('preserves assigned options', () => {
    const error = new AppError({
      code: 'SALE_CLOSED',
      message: 'sale is closed',
      statusCode: 409,
      details: { saleId: 'x' },
      fieldErrors: { qty: ['must be positive'] },
    });
    expect(error.statusCode).toBe(409);
    expect(error.details).toEqual({ saleId: 'x' });
    expect(error.fieldErrors).toEqual({ qty: ['must be positive'] });
  });
});

describe('toCanonicalError', () => {
  it('maps an AppError to canonical shape', () => {
    const error = new AppError({
      code: 'BUSINESS_RULE',
      message: 'rule violated',
      statusCode: 422,
      details: { ref: 'a' },
      fieldErrors: { x: ['y'] },
    });
    expect(toCanonicalError(error, 422)).toEqual({
      code: 'BUSINESS_RULE',
      message: 'rule violated',
      details: { ref: 'a' },
      fieldErrors: { x: ['y'] },
    });
  });

  it('maps a NotFoundException', () => {
    const error = new NotFoundException('order not found');
    const canonical = toCanonicalError(error, 404);
    expect(canonical.code).toBe('NOT_FOUND');
    expect(canonical.message).toBe('order not found');
    expect(canonical.details).toEqual({});
    expect(canonical.fieldErrors).toEqual({});
  });

  it('maps a BadRequestException with a message array to field errors', () => {
    const error = new BadRequestException({
      message: ['name is required', 'code is required'],
      error: 'Bad Request',
      statusCode: 400,
    });
    const canonical = toCanonicalError(error, 400);
    expect(canonical.code).toBe('VALIDATION_FAILED');
    expect(canonical.message).toBe('name is required; code is required');
    expect(canonical.fieldErrors).toEqual({
      item_0: ['name is required'],
      item_1: ['code is required'],
    });
  });

  it('masks a generic Error at 500 without leaking internals', () => {
    const error = new Error('secret internal detail');
    const canonical = toCanonicalError(error, 500);
    expect(canonical.code).toBe('INTERNAL_SERVER_ERROR');
    expect(canonical.message).toBe('Internal Server Error');
    expect(canonical.details).toEqual({});
    expect(canonical.fieldErrors).toEqual({});
  });

  it('keeps an AppError message even at 500 (trusted error)', () => {
    const error = new AppError({
      code: 'CONFIG_ERROR',
      message: 'application misconfigured',
      statusCode: 500,
      details: { cause: 'missing value' },
    });
    const canonical = toCanonicalError(error, 500);
    expect(canonical.code).toBe('CONFIG_ERROR');
    expect(canonical.message).toBe('application misconfigured');
    expect(canonical.details).toEqual({ cause: 'missing value' });
  });
});
