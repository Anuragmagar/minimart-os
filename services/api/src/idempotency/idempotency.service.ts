import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../common/errors/app-error.js';
import { AppConfigService } from '../config/app-config.service.js';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import type { IdempotencyScope } from './idempotency-scope.js';

export const IDEMPOTENCY_CONFLICT_CODE = 'IDEMPOTENCY_CONFLICT';
export const IDEMPOTENCY_IN_PROGRESS_CODE = 'IDEMPOTENCY_IN_PROGRESS';

export type IdempotencyOutcome<T> =
  | { outcome: 'executed'; result: T; responseStatus: number }
  | { outcome: 'replayed'; result: unknown; responseStatus: number };

export interface IdempotencyExecuteParams<T> {
  operationKey: string;
  scope: IdempotencyScope;
  requestHash: string;
  run: (tx: PrismaTx) => Promise<T>;
  responseStatus?: number;
  resolveResponseStatus?: () => number;
}

const MAX_CONCURRENCY_RETRIES = 3;
const CONCURRENCY_RETRY_DELAY_MS = 20;

@Injectable()
export class IdempotencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async execute<T>(
    params: IdempotencyExecuteParams<T>,
  ): Promise<IdempotencyOutcome<T>> {
    const responseStatus = params.responseStatus ?? 200;
    let attempts = 0;
    for (;;) {
      try {
        return await this.prisma.runInTransaction(async (tx) => {
          const existing = await tx.idempotencyRecord.findUnique({
            where: IdempotencyService.keyWhere(params),
          });

          if (existing) {
            const recordedStatus = existing.responseStatus ?? responseStatus;
            if (existing.status === 'COMPLETED') {
              if (existing.requestHash === params.requestHash) {
                return {
                  outcome: 'replayed',
                  result: existing.responseBody,
                  responseStatus: recordedStatus,
                } as IdempotencyOutcome<T>;
              }
              throw IdempotencyService.conflict();
            }
            if (existing.expiresAt.getTime() > Date.now()) {
              throw IdempotencyService.inProgress();
            }
            await tx.idempotencyRecord.delete({
              where: { id: existing.id },
            });
          }

          await tx.idempotencyRecord.create({
            data: {
              organizationId: params.scope.organizationId,
              storeId: params.scope.storeId,
              userId: params.scope.userId,
              operationKey: params.operationKey,
              requestHash: params.requestHash,
              status: 'IN_PROGRESS',
              expiresAt: IdempotencyService.expiry(this.config),
            },
          });

          const result = await params.run(tx);

          const completedStatus =
            params.resolveResponseStatus?.() ?? responseStatus;

          await tx.idempotencyRecord.update({
            where: IdempotencyService.keyWhere(params),
            data: {
              status: 'COMPLETED',
              responseStatus: completedStatus,
              responseBody: result as object,
            },
          });

          return {
            outcome: 'executed',
            result,
            responseStatus: completedStatus,
          } as IdempotencyOutcome<T>;
        });
      } catch (error) {
        if (IdempotencyService.isUniqueViolation(error)) {
          attempts += 1;
          if (attempts < MAX_CONCURRENCY_RETRIES) {
            await IdempotencyService.delay(CONCURRENCY_RETRY_DELAY_MS);
            continue;
          }
        }
        throw error;
      }
    }
  }

  private static keyWhere(params: {
    operationKey: string;
    scope: IdempotencyScope;
  }) {
    return {
      organizationId_operationKey: {
        organizationId: params.scope.organizationId,
        operationKey: params.operationKey,
      },
    };
  }

  private static expiry(config: AppConfigService): Date {
    return new Date(Date.now() + config.idempotencyTtlSeconds * 1000);
  }

  private static conflict(): AppError {
    return new AppError({
      code: IDEMPOTENCY_CONFLICT_CODE,
      message: 'Idempotency key was already used for a different request',
      statusCode: 409,
    });
  }

  private static inProgress(): AppError {
    return new AppError({
      code: IDEMPOTENCY_IN_PROGRESS_CODE,
      message: 'An operation with this Idempotency-Key is already in progress',
      statusCode: 409,
    });
  }

  private static isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
