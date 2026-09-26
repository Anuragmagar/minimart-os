export type FieldErrors = Record<string, string[]>;

export interface AppErrorOptions {
  code: string;
  message: string;
  statusCode?: number;
  details?: Record<string, unknown>;
  fieldErrors?: FieldErrors;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: Record<string, unknown>;
  readonly fieldErrors: FieldErrors;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.message = options.message;
    this.statusCode = options.statusCode ?? 500;
    this.details = options.details ?? {};
    this.fieldErrors = options.fieldErrors ?? {};
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
