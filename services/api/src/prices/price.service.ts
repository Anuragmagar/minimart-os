import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { PrismaService, type PrismaTx } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { TenantContext } from '../common/auth/authenticated-user.js';
import { PriceRepository } from './price.repository.js';
import { ProductRepository } from '../products/product.repository.js';
import { CreatePriceDto } from './dto/create-price.dto.js';
import { UpdatePriceDto } from './dto/update-price.dto.js';
import { PriceQueryDto } from './dto/price-query.dto.js';

const AUDIT_ENTITY = 'ProductPrice';
const DEFAULT_PAGE_SIZE = 20;

/**
 * The fields of a stored row the window logic needs. Prisma returns the dates as
 * `Date` objects while a payload carries ISO strings, so every comparison here
 * is between timestamps rather than between text: ISO strings would only compare
 * correctly while both sides used the same UTC offset, which is not something a
 * client can be relied on to do.
 */
type StoredPeriod = {
  id: string;
  priceType: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

@Injectable()
export class PriceService {
  constructor(
    @Inject(PriceRepository)
    private readonly priceRepository: PriceRepository,
    private readonly productRepository: ProductRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findById(
    ctx: TenantContext,
    productId: string,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    await this.requireProduct(ctx, productId, tx);
    return this.requirePrice(ctx, productId, id, tx);
  }

  /**
   * A price history is read newest first by default, because the question a
   * product page asks is what the price is now and what it used to be, not what
   * the shop charged first. `effectiveOn` narrows the listing to the period in
   * force at an instant, which is the same half-open interval the overlap rule
   * uses, so the two answers can never disagree.
   */
  async findAll(
    ctx: TenantContext,
    productId: string,
    query: PriceQueryDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    await this.requireProduct(ctx, productId, tx);

    // The DTO declares defaults, which the validation pipe applies to a request
    // that arrives over HTTP. A caller that reaches the service directly, as the
    // unit tests do, can still omit them, so the page and the page size are
    // resolved here once and used for both the window and the offset. Applying
    // the default to the size but not the offset would silently page by twenty
    // while asking Prisma for an unbounded page.
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;

    return this.priceRepository.findAllForProduct(
      {
        productId,
        organizationId: ctx.organizationId,
        priceType: query.priceType,
        effectiveOn:
          query.effectiveOn === undefined
            ? undefined
            : new Date(query.effectiveOn),
        orderBy: query.sortBy,
        orderDir: query.sortOrder,
        take: limit,
        skip: (page - 1) * limit,
      },
      tx,
    );
  }

  async create(
    ctx: TenantContext,
    productId: string,
    createPriceDto: CreatePriceDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    // The parent product is resolved through the caller's organization before
    // anything is read or written, so a productId belonging to another tenant is
    // reported as a missing product and the overlap check below can never be
    // pointed at another organization's price history.
    await this.requireProduct(ctx, productId, tx);

    const effectiveFrom = new Date(createPriceDto.effectiveFrom);
    const effectiveTo = toDateOrNull(createPriceDto.effectiveTo);
    this.requireOrderedWindow(effectiveFrom, effectiveTo);

    return this.write(tx, async (write) => {
      await this.requireNoOverlap(
        productId,
        createPriceDto.priceType,
        effectiveFrom,
        effectiveTo,
        undefined,
        write,
      );

      const created = await this.priceRepository.create(
        {
          productId,
          priceType: createPriceDto.priceType,
          // Passed as a string so the two decimal places of NUMERIC(14,2) reach
          // the column exactly, instead of travelling through a double.
          amount: createPriceDto.amount,
          effectiveFrom,
          effectiveTo,
        },
        write,
      );

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'product_price.create',
          entity: AUDIT_ENTITY,
          entityId: created.id,
          after: created,
        },
        write,
      );

      return created;
    });
  }

  /**
   * Retiring a period is the only edit a price accepts, and it is what a price
   * change is expressed as: close the current period at the instant its successor
   * starts, then insert the successor. The amount, the price type and the start of
   * the window are deliberately not editable, because those are the fields that
   * make the row a record of what the price was; changing one in place would
   * rewrite history rather than extend it. The user was asked and chose
   * append-only for this reason.
   *
   * An omitted `effectiveTo` leaves the stored value alone rather than clearing
   * it, so a read-modify-write cannot silently reopen a price. An explicit null
   * does clear it, and is then held to exactly the same ordering and overlap
   * rules as any other window: reopening a period is only possible when no other
   * period of the same price type already claims the time it would regain, so it
   * can fill a gap in a price series but can never overwrite a successor.
   */
  async update(
    ctx: TenantContext,
    productId: string,
    id: string,
    updatePriceDto: UpdatePriceDto,
    tx?: PrismaTx,
  ): Promise<unknown> {
    await this.requireProduct(ctx, productId, tx);
    const existing = (await this.requirePrice(
      ctx,
      productId,
      id,
      tx,
    )) as StoredPeriod;

    if (updatePriceDto.effectiveTo === undefined) {
      return existing;
    }

    const effectiveTo = toDateOrNull(updatePriceDto.effectiveTo);
    this.requireOrderedWindow(existing.effectiveFrom, effectiveTo);

    return this.write(tx, async (write) => {
      await this.requireNoOverlap(
        productId,
        existing.priceType,
        existing.effectiveFrom,
        effectiveTo,
        id,
        write,
      );

      const updated = await this.priceRepository.update(
        id,
        { effectiveTo },
        write,
      );

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'product_price.update',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: existing,
          after: updated,
        },
        write,
      );

      return updated;
    });
  }

  /**
   * A price period is the only record of what a product was sold for, so it is
   * removed only while it has not started yet: a future price typed by mistake is
   * a mistake nobody has been charged yet. Once the period has taken effect it is
   * retired instead, which leaves the history in place. The user was asked and
   * chose this over an unconditional delete and over having no delete at all.
   *
   * Nothing in the schema references a price row — a sale snapshots the unit
   * price it was given (BR-035) — so this restriction is a history guarantee, not
   * a database constraint made explicit.
   */
  async delete(
    ctx: TenantContext,
    productId: string,
    id: string,
    tx?: PrismaTx,
  ): Promise<void> {
    await this.requireProduct(ctx, productId, tx);
    const existing = (await this.requirePrice(
      ctx,
      productId,
      id,
      tx,
    )) as StoredPeriod;

    if (existing.effectiveFrom.getTime() <= Date.now()) {
      throw new BadRequestException(
        'A price that has already taken effect cannot be deleted; retire it by setting effectiveTo instead',
      );
    }

    await this.write(tx, async (write) => {
      await this.priceRepository.delete(id, write);

      await this.audit.record(
        {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          action: 'product_price.delete',
          entity: AUDIT_ENTITY,
          entityId: id,
          before: existing,
        },
        write,
      );
    });
  }

  private write<T>(
    tx: PrismaTx | undefined,
    fn: (write: PrismaTx) => Promise<T>,
  ): Promise<T> {
    return tx ? fn(tx) : this.prisma.runInTransaction(fn);
  }

  /**
   * A null end means the price is open-ended, which is the normal state of the
   * current price. A supplied end must be strictly later than the start: equal
   * dates describe a period of zero length that no instant could fall inside, and
   * an earlier end describes a period that never opens.
   */
  private requireOrderedWindow(
    effectiveFrom: Date,
    effectiveTo: Date | null,
  ): void {
    if (Number.isNaN(effectiveFrom.getTime())) {
      throw new BadRequestException('effectiveFrom is not a valid date');
    }
    if (effectiveTo !== null) {
      if (Number.isNaN(effectiveTo.getTime())) {
        throw new BadRequestException('effectiveTo is not a valid date');
      }
      if (effectiveTo.getTime() <= effectiveFrom.getTime()) {
        throw new BadRequestException(
          'effectiveTo must be later than effectiveFrom',
        );
      }
    }
  }

  /**
   * Two periods of the same price type for the same product may never intersect,
   * so the price at any instant is unique. The user was asked whether past
   * windows may be overlapped by a back-dated insert and chose the strict
   * reading: nothing overlaps, which is the only shape under which "the price on
   * that date" has one answer for the whole history.
   *
   * The check lives in the application because Prisma cannot express a PostgreSQL
   * exclusion constraint (ASM-015(e)). It is re-run inside the write transaction
   * so the validation and the insert cannot be interleaved by a concurrent
   * request; the schema cannot make that atomic on its own, and the composite
   * index on `(productId, priceType, effectiveFrom)` is what keeps the candidate
   * read cheap.
   */
  private async requireNoOverlap(
    productId: string,
    priceType: string,
    effectiveFrom: Date,
    effectiveTo: Date | null,
    excludeId: string | undefined,
    tx: PrismaTx,
  ): Promise<void> {
    const overlapping = await this.priceRepository.findOverlappingForType(
      productId,
      priceType,
      effectiveFrom,
      effectiveTo,
      excludeId,
      tx,
    );

    if (overlapping.length > 0) {
      throw new ConflictException(
        'An overlapping price period already exists for this product and price type',
      );
    }
  }

  /**
   * The parent product is resolved in the caller's own organization before any
   * price is touched, so a productId from another tenant is reported as a missing
   * product rather than a missing price, and the price routes cannot be used to
   * discover which products another organization owns (BR-040).
   *
   * Path parameters are not shape-checked, which matches the product, category,
   * brand, unit, barcode and conversion routes: a well-formed UUID that belongs
   * to no visible product is reported as a missing product.
   */
  private async requireProduct(
    ctx: TenantContext,
    productId: string,
    tx?: PrismaTx,
  ): Promise<void> {
    const product = await this.productRepository.findByIdInOrganization(
      productId,
      ctx.organizationId,
      tx,
    );
    if (!product) {
      throw new NotFoundException('Product not found');
    }
  }

  private async requirePrice(
    ctx: TenantContext,
    productId: string,
    id: string,
    tx?: PrismaTx,
  ): Promise<unknown> {
    const price = await this.priceRepository.findByIdInProduct(
      id,
      productId,
      ctx.organizationId,
      tx,
    );
    if (!price) {
      throw new NotFoundException('Price not found');
    }
    return price;
  }
}

function toDateOrNull(value: string | null | undefined): Date | null {
  return value === undefined || value === null ? null : new Date(value);
}
